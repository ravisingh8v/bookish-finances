import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";

export interface Book {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  color: string;
  icon: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  members: { id?: string; user_id: string; role: string; profile?: unknown }[];
  my_access?: { user_id: string; role: string }[];
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

function sortBooks(books: Book[]) {
  return [...books].sort(
    (a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    },
  );
}

function assertOnline(isOnline: boolean) {
  if (!isOnline) {
    throw new Error("You're offline. Connect to the internet to continue.");
  }
}

export function useBooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline } = useOfflineSync();

  const booksQuery = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("expense_books")
        .select(
          "*, members:book_members(id, user_id, role), my_access:book_members!inner(user_id, role)",
        )
        .eq("my_access.user_id", user.id);
      if (error) throw error;

      const rawBooks = (data ?? []) as Book[];
      const bookIds = rawBooks.map((book) => book.id);
      const { data: orders, error: orderError } = bookIds.length
        ? await supabase
            .from("user_book_orders")
            .select("book_id, sort_order")
            .eq("user_id", user.id)
            .in("book_id", bookIds)
        : { data: [], error: null };
      if (orderError) throw orderError;

      const orderMap = new Map(
        (orders ?? []).map((entry) => [entry.book_id, entry.sort_order]),
      );
      return sortBooks(
        rawBooks.map((book, index) => ({
          ...book,
          sort_order: orderMap.get(book.id) ?? book.sort_order ?? index,
        })),
      );
    },
    enabled: !!user && isOnline,
  });

  // Realtime: refresh book list whenever books or memberships change.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("books-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expense_books" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["books"] });
          queryClient.invalidateQueries({ queryKey: ["book-totals"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "book_members" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["books"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_book_orders",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["books"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const createBook = useMutation({
    mutationFn: async (book: BookInput) => {
      assertOnline(isOnline);
      const userId = user?.id;
      if (!userId) {
        throw new Error("User ID not available. Please log in again.");
      }

      const { data, error } = await supabase
        .from("expense_books")
        .insert({
          name: book.name,
          description: book.description ?? null,
          currency: book.currency ?? "INR",
          color: book.color ?? "#10B981",
          icon: book.icon ?? "wallet",
          created_by: userId,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: memberError } = await supabase
        .from("book_members")
        .insert({ book_id: data.id, user_id: userId, role: "owner" });
      if (memberError) throw memberError;

      await supabase.from("user_book_orders").upsert(
        {
          user_id: userId,
          book_id: data.id,
          sort_order: 0,
        },
        { onConflict: "user_id,book_id" },
      );

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const updateBook = useMutation({
    mutationFn: async (params: BookUpdate) => {
      assertOnline(isOnline);
      const { error } = await supabase
        .from("expense_books")
        .update({
          name: params.name,
          description: params.description,
          currency: params.currency,
          color: params.color,
          icon: params.icon,
        })
        .eq("id", params.bookId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const deleteBook = useMutation({
    mutationFn: async (bookId: string) => {
      assertOnline(isOnline);
      const { error } = await supabase
        .from("expense_books")
        .delete()
        .eq("id", bookId);
      if (error) throw error;
    },
    onMutate: (bookId: string) => {
      queryClient.setQueryData(["books"], (old: Book[] | undefined) =>
        (old ?? []).filter((book) => book.id !== bookId),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["book-totals"] });
    },
  });

  const duplicateBook = useMutation({
    mutationFn: async ({
      bookId,
      includemembers = false,
      customName,
    }: {
      bookId: string;
      includemembers?: boolean;
      customName?: string;
    }) => {
      assertOnline(isOnline);
      const userId = user?.id;
      if (!userId) {
        throw new Error("User ID not available. Please log in again.");
      }

      const source = (booksQuery.data ?? []).find((b) => b.id === bookId);
      if (!source) throw new Error("Book not found");

      const { data: newBook, error: createError } = await supabase
        .from("expense_books")
        .insert({
          name: customName || `${source.name} (Copy)`,
          description: source.description ?? null,
          currency: source.currency,
          color: source.color,
          icon: source.icon,
          created_by: userId,
        })
        .select()
        .single();
      if (createError) throw createError;

      const { error: memberError } = await supabase
        .from("book_members")
        .insert({ book_id: newBook.id, user_id: userId, role: "owner" });
      if (memberError) throw memberError;

      if (includemembers) {
        const { data: sourceMembers } = await supabase
          .from("book_members")
          .select("*")
          .eq("book_id", bookId);
        const membersToAdd = (sourceMembers || [])
          .filter((m) => m.user_id !== userId)
          .map((m) => ({
            book_id: newBook.id,
            user_id: m.user_id,
            role: m.role,
          }));
        if (membersToAdd.length > 0) {
          await supabase.from("book_members").insert(membersToAdd);
        }
      }

      const { data: sourceExpenses } = await supabase
        .from("expenses")
        .select("*")
        .eq("book_id", bookId);
      if (sourceExpenses && sourceExpenses.length > 0) {
        const expensesToInsert = sourceExpenses.map((expense) => ({
          book_id: newBook.id,
          title: expense.title,
          amount: expense.amount,
          date: expense.date,
          category_id: expense.category_id || null,
          expense_type: expense.expense_type ?? "debit",
          payment_method: expense.payment_method ?? "cash",
          notes: expense.notes ?? null,
          tags: expense.tags ?? [],
          paid_by: expense.paid_by ?? userId,
          created_by: expense.created_by ?? userId,
        }));
        const { error: insertError } = await supabase
          .from("expenses")
          .insert(expensesToInsert as never);
        if (insertError) throw insertError;
      }

      return newBook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["book-totals"] });
    },
  });

  const reorderBooks = useMutation({
    mutationFn: async (orderedBookIds: string[]) => {
      assertOnline(isOnline);
      const userId = user?.id;
      if (!userId) throw new Error("User ID not available. Please log in again.");

      const rows = orderedBookIds.map((bookId, index) => ({
        user_id: userId,
        book_id: bookId,
        sort_order: index,
      }));
      const { error } = await supabase
        .from("user_book_orders")
        .upsert(rows, { onConflict: "user_id,book_id" });
      if (error) throw error;
    },
    onMutate: (orderedBookIds: string[]) => {
      queryClient.setQueryData(["books"], (old: Book[] | undefined) => {
        const orderMap = new Map(
          orderedBookIds.map((bookId, index) => [bookId, index]),
        );
        return sortBooks(
          (old ?? []).map((book) => ({
            ...book,
            sort_order: orderMap.get(book.id) ?? book.sort_order,
          })),
        );
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const isBookOwner = (book: Pick<Book, "members">) =>
    book.members?.some(
      (member) => member.user_id === user?.id && member.role === "owner",
    );

  return {
    books: (booksQuery.data ?? []) as Book[],
    isLoading: booksQuery.isLoading && !booksQuery.data,
    isError: booksQuery.isError,
    createBook,
    updateBook,
    deleteBook,
    duplicateBook,
    reorderBooks,
    isBookOwner,
  };
}
