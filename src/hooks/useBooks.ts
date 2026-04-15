import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { withNetworkTimeout } from "@/lib/network";
import { useAuth } from "./useAuth";
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
  const cached = await db.books.get(bookId);
  if (!cached) return;
  await db.books.put({
    ...cached,
    data: updater(cached.data as Book),
    cachedAt: Date.now(),
  });
}

export function useBooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    isOnline,
    queueAction,
    cancelQueuedCreate,
    refreshPendingCount,
    syncNow,
  } = useOfflineSync();
  const [localBooks, setLocalBooks] = useState<Book[]>([]);

  useEffect(() => {
    let active = true;
    db.books
      .orderBy("cachedAt")
      .reverse()
      .limit(MAX_BOOKS_CACHE)
      .toArray()
      .then((cached) => {
        if (!active) return;
        setLocalBooks(cached.map((entry) => entry.data as Book));
      })
      .catch(() => {
        if (!active) return;
        setLocalBooks([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const booksQuery = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const cached = await db.books
        .orderBy("cachedAt")
        .reverse()
        .limit(MAX_BOOKS_CACHE)
        .toArray();
      const cachedBooks = cached.map((entry) => entry.data as Book);

      if (!user) return [];
      if (!isOnline) return cachedBooks;

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
        await preloadExpenses(books.map((book) => book.id));
        return books;
      } catch {
        return cachedBooks;
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
      const optimisticBook: Book = {
        id: tempId,
        name: book.name,
        description: book.description ?? null,
        currency: book.currency ?? "INR",
        color: book.color ?? "#10B981",
        icon: book.icon ?? "wallet",
        created_at: now,
        updated_at: now,
        created_by: user!.id,
        members: [{ user_id: user!.id, role: "owner" }],
        my_access: [{ user_id: user!.id, role: "owner" }],
        _offline: !isOnline,
      };

      queryClient.setQueryData(["books"], (old: Book[] | undefined) => [
        optimisticBook,
        ...(old ?? []),
      ]);
      await db.books.put({
        id: tempId,
        data: optimisticBook,
        cachedAt: Date.now(),
      });
      await queueAction({
        type: "create_book",
        payload: { ...book, tempId },
        tempId,
        userId: user?.id,
      });
      if (isOnline) {
        void syncNow();
      }
      return { ...optimisticBook, _offline: true };
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

      const actions = await db.syncQueue.toArray();
      const pendingCreate = actions.find(
        (action) =>
          action.type === "create_book" &&
          (action.tempId === params.bookId ||
            action.payload.tempId === params.bookId),
      );

      if (pendingCreate) {
        await db.syncQueue.put({
          ...pendingCreate,
          payload: { ...pendingCreate.payload, ...patch, tempId: params.bookId },
        });
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
      await db.books.delete(bookId);
      await db.expenses.delete(bookId);

      if (bookId.startsWith("temp_")) {
        const actions = await db.syncQueue.toArray();
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
          await db.syncQueue.bulkDelete(linkedActionIds);
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
          profileMap = new Map(profiles?.map((profile) => [profile.user_id, profile]) ?? []);
        }

        const enriched = (expenses ?? []).map((expense) => ({
          ...expense,
          creator_profile: profileMap.get(expense.created_by) ?? null,
          payer_profile: profileMap.get(expense.paid_by) ?? null,
          _offline: false,
        }));

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
