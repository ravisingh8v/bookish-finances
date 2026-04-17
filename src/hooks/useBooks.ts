import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { isOfflineLikeError, withNetworkTimeout } from "@/lib/network";
import {
  getStoredBooks,
  removeStoredBook,
  removeStoredExpenseBucket,
  setStoredBooks,
  setStoredExpenses,
  updateStoredBook,
  upsertStoredBook,
} from "@/lib/offlineJournal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getUserId, useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";

const MAX_BOOKS_CACHE = 10;

export interface Book {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  members: { id?: string; user_id: string; role: string; profile?: unknown }[];
  my_access?: { user_id: string; role: string }[];
  _offline?: boolean;
}

type BookInput = {
  name: string;
  description?: string;
  currency?: string;
  color?: string;
  icon?: string;
};

type BookUpdate = BookInput & {
  bookId: string;
};

async function cacheBooks(books: Book[]) {
  setStoredBooks(books);
  await db.books.clear();
  await Promise.all(
    books.slice(0, MAX_BOOKS_CACHE).map((book) =>
      db.books.put({
        id: book.id,
        data: book,
        cachedAt: Date.now(),
      }),
    ),
  );
}

async function updateCachedBook(bookId: string, updater: (book: Book) => Book) {
  updateStoredBook<Book>(bookId, updater);
  const cached = await db.books.get(bookId);
  if (!cached) return;

  await db.books.put({
    ...cached,
    data: updater(cached.data as Book),
    cachedAt: Date.now(),
  });
}

function getCachedBooksSync(): Book[] {
  return getStoredBooks<Book>();
}

async function getCachedBooksAsync(): Promise<Book[]> {
  try {
    const cached = await db.books
      .orderBy("cachedAt")
      .reverse()
      .limit(MAX_BOOKS_CACHE)
      .toArray();
    if (cached.length > 0) return cached.map((entry) => entry.data as Book);
  } catch {
    // IndexedDB may fail
  }
  return getCachedBooksSync();
}

export function useBooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    isOnline,
    queueAction,
    cancelQueuedCreate,
    getQueuedActions,
    removeQueuedActions,
    refreshPendingCount,
    syncNow,
    upsertQueuedAction,
  } = useOfflineSync();
  const [localBooks, setLocalBooks] = useState<Book[]>([]);

  useEffect(() => {
    let active = true;
    getCachedBooksAsync().then((books) => {
      if (active) setLocalBooks(books);
    });
    return () => { active = false; };
  }, []);

  const booksQuery = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const cachedBooks = await getCachedBooksAsync();

      if (!user) return [];

      if (!isOnline) {
        return cachedBooks.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      try {
        const { data, error } = await withNetworkTimeout(
          supabase
            .from("expense_books")
            .select(
              "*, members:book_members(id, user_id, role), my_access:book_members!inner(user_id, role)",
            )
            .order("created_at", { ascending: false })
            .eq("my_access.user_id", user.id),
        );
        if (error) throw error;

        const books = (data ?? []) as Book[];
        await cacheBooks(books);
        void preloadExpenses(books.map((book) => book.id));
        return books;
      } catch (err) {
        if (isOfflineLikeError(err)) {
          return cachedBooks.sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }
        return cachedBooks.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
    },
    enabled: !!user,
    staleTime: 30_000,
    placeholderData: localBooks,
  });

  const createBook = useMutation({
    mutationFn: async (book: BookInput) => {
      const tempId = `temp_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const userId = user?.id || getUserId();

      if (!userId) {
        throw new Error("User ID not available. Please log in again.");
      }

      const optimisticBook: Book = {
        id: tempId,
        name: book.name,
        description: book.description ?? null,
        currency: book.currency ?? "INR",
        color: book.color ?? "#10B981",
        icon: book.icon ?? "wallet",
        created_at: now,
        updated_at: now,
        created_by: userId,
        members: [{ user_id: userId, role: "owner" }],
        my_access: [{ user_id: userId, role: "owner" }],
        _offline: true,
      };

      queryClient.setQueryData(["books"], (old: Book[] | undefined) => [
        optimisticBook,
        ...(old ?? []),
      ]);
      upsertStoredBook(optimisticBook);
      await db.books.put({
        id: tempId,
        data: optimisticBook,
        cachedAt: Date.now(),
      });
      await queueAction({
        type: "create_book",
        payload: { ...book, tempId },
        tempId,
        userId: userId,
      });
      if (isOnline) {
        void syncNow();
      }
      return optimisticBook;
    },
  });

  const updateBook = useMutation({
    mutationFn: async (params: BookUpdate) => {
      const patch = {
        name: params.name,
        description: params.description,
        currency: params.currency,
        color: params.color,
        icon: params.icon,
      };

      queryClient.setQueryData(["books"], (old: Book[] | undefined) =>
        (old ?? []).map((book) =>
          book.id === params.bookId
            ? { ...book, ...patch, updated_at: new Date().toISOString() }
            : book,
        ),
      );
      await updateCachedBook(params.bookId, (book) => ({
        ...book,
        ...patch,
        updated_at: new Date().toISOString(),
      }));

      const actions = await getQueuedActions();
      const pendingCreate = actions.find(
        (action) =>
          action.type === "create_book" &&
          (action.tempId === params.bookId ||
            action.payload.tempId === params.bookId),
      );

      if (pendingCreate) {
        const nextAction = {
          ...pendingCreate,
          payload: {
            ...pendingCreate.payload,
            ...patch,
            tempId: params.bookId,
          },
        };
        await upsertQueuedAction(nextAction);
      } else {
        await queueAction({
          type: "update_book",
          payload: params,
          userId: user?.id,
        });
      }

      if (isOnline) {
        void syncNow();
      }
    },
  });

  const deleteBook = useMutation({
    mutationFn: async (bookId: string) => {
      queryClient.setQueryData(["books"], (old: Book[] | undefined) =>
        (old ?? []).filter((book) => book.id !== bookId),
      );
      removeStoredBook(bookId);
      removeStoredExpenseBucket(bookId);
      await Promise.all([db.books.delete(bookId), db.expenses.delete(bookId)]);

      if (bookId.startsWith("temp_")) {
        const actions = await getQueuedActions();
        const linkedActionIds = actions
          .filter((action) => {
            const payload = action.payload as Record<string, unknown>;
            return (
              action.tempId === bookId ||
              payload.tempId === bookId ||
              payload.bookId === bookId ||
              payload.book_id === bookId
            );
          })
          .map((action) => action.id);
        if (linkedActionIds.length > 0) {
          await removeQueuedActions(linkedActionIds);
          await refreshPendingCount();
        }
        return;
      }

      await cancelQueuedCreate(bookId);
      await queueAction({
        type: "delete_book",
        payload: { bookId },
        userId: user?.id,
      });
      if (isOnline) {
        void syncNow();
      }
    },
  });

  const duplicateBook = useMutation({
    mutationFn: async ({
      bookId,
      copyMembers,
    }: {
      bookId: string;
      copyMembers: boolean;
    }) => {
      if (!isOnline) {
        throw new Error("Book duplication requires internet connection");
      }
      if (!user) throw new Error("Not authenticated");

      const source = booksQuery.data?.find((b) => b.id === bookId);
      if (!source) throw new Error("Book not found");

      // 1. Create new book
      const { data: newBook, error: bookErr } = await supabase
        .from("expense_books")
        .insert({
          name: `${source.name} (Copy)`,
          description: source.description,
          currency: source.currency,
          color: source.color,
          icon: source.icon,
          created_by: user.id,
        })
        .select()
        .single();
      if (bookErr) throw bookErr;

      // 2. Add owner membership
      await supabase
        .from("book_members")
        .insert({ book_id: newBook.id, user_id: user.id, role: "owner" });

      // 3. Copy other members if requested
      if (copyMembers && source.members) {
        const others = source.members
          .filter((m) => m.user_id !== user.id)
          .map((m) => ({
            book_id: newBook.id,
            user_id: m.user_id,
            role: m.role,
          }));
        if (others.length > 0) {
          await supabase.from("book_members").insert(others);
        }
      }

      // 4. Copy all expenses
      const { data: srcExpenses } = await supabase
        .from("expenses")
        .select("*")
        .eq("book_id", bookId);

      if (srcExpenses && srcExpenses.length > 0) {
        const newExpenses = srcExpenses.map((e) => ({
          book_id: newBook.id,
          title: e.title,
          amount: e.amount,
          date: e.date,
          category_id: e.category_id,
          expense_type: e.expense_type,
          payment_method: e.payment_method,
          notes: e.notes,
          tags: e.tags,
          paid_by: user.id,
          created_by: user.id,
        }));
        await supabase.from("expenses").insert(newExpenses);
      }

      await queryClient.invalidateQueries({ queryKey: ["books"] });
      return newBook;
    },
  });

  const isBookOwner = (book: Pick<Book, "members">) =>
    book.members?.some(
      (member) => member.user_id === user?.id && member.role === "owner",
    );

  return {
    books: (booksQuery.data ?? []) as Book[],
    isLoading: booksQuery.isLoading && !booksQuery.data,
    createBook,
    updateBook,
    deleteBook,
    duplicateBook,
    isBookOwner,
  };
}

async function preloadExpenses(bookIds: string[]) {
  await Promise.all(
    bookIds.slice(0, MAX_BOOKS_CACHE).map(async (bookId) => {
      try {
        const { data: expenses, error } = await supabase
          .from("expenses")
          .select("*, categories(name, icon, color)")
          .eq("book_id", bookId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) return;

        const userIds = [
          ...new Set(
            (expenses ?? []).flatMap((expense) => [
              expense.created_by,
              expense.paid_by,
            ]),
          ),
        ].filter(Boolean);

        let profileMap = new Map<
          string,
          { display_name: string | null; email: string | null }
        >();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, display_name, email")
            .in("user_id", userIds);
          profileMap = new Map(
            profiles?.map((profile) => [profile.user_id, profile]) ?? [],
          );
        }

        const enriched = (expenses ?? []).map((expense) => ({
          ...expense,
          creator_profile: profileMap.get(expense.created_by) ?? null,
          payer_profile: profileMap.get(expense.paid_by) ?? null,
          _offline: false,
        }));

        setStoredExpenses(bookId, enriched);
        await db.expenses.put({
          id: bookId,
          expenses: enriched,
          cachedAt: Date.now(),
        });
      } catch {
        // Ignore background cache warmup errors.
      }
    }),
  );
}
