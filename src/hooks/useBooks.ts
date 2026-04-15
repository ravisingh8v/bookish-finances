import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";
import { getCacheEntry, setCacheEntry } from "@/lib/offlineStore";
import { useEffect } from "react";

export function useBooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline, queueAction } = useOfflineSync();

  const booksQuery = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_books")
        .select(
          "*, members:book_members(user_id, role), my_access:book_members!inner(user_id, role)",
        )
        .order("created_at", { ascending: false })
        .eq("my_access.user_id", user!.id);
      if (error) throw error;
      // Cache for offline use
      setCacheEntry("books", data).catch(() => {});
      return data;
    },
    enabled: !!user && isOnline,
    // Seed with cached data when offline
    placeholderData: () => {
      if (!isOnline) return undefined; // will be filled by initialData
      return undefined;
    },
  });

  // Load cached books when offline
  useEffect(() => {
    if (!isOnline && user && !booksQuery.data?.length) {
      getCacheEntry("books").then((cached) => {
        if (cached) {
          queryClient.setQueryData(["books"], cached);
        }
      }).catch(() => {});
    }
  }, [isOnline, user, booksQuery.data, queryClient]);

  const createBook = useMutation({
    mutationFn: async (book: {
      name: string;
      description?: string;
      currency?: string;
      color?: string;
      icon?: string;
    }) => {
      if (!isOnline) {
        await queueAction({ type: "create_book", payload: book, userId: user?.id });
        // Optimistically add to cache
        const tempBook = {
          id: crypto.randomUUID(),
          ...book,
          created_by: user?.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          color: book.color ?? "#10B981",
          currency: book.currency ?? "INR",
          icon: book.icon ?? "wallet",
          description: book.description ?? null,
          members: [{ user_id: user?.id, role: "owner" }],
          my_access: [{ user_id: user?.id, role: "owner" }],
          _offline: true,
        };
        queryClient.setQueryData(["books"], (old: any[] | undefined) => [tempBook, ...(old ?? [])]);
        return tempBook;
      }

      const { data, error } = await supabase
        .from("expense_books")
        .insert({ ...book, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;

      await supabase
        .from("book_members")
        .insert({ book_id: data.id, user_id: user!.id, role: "owner" });
      return data;
    },
    onSuccess: (_, __, ___) => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ["books"] });
      }
    },
  });

  const deleteBook = useMutation({
    mutationFn: async (bookId: string) => {
      if (!isOnline) {
        await queueAction({ type: "delete_book", payload: { bookId }, userId: user?.id });
        // Optimistically remove from cache
        queryClient.setQueryData(["books"], (old: any[] | undefined) =>
          (old ?? []).filter((b: any) => b.id !== bookId)
        );
        return;
      }

      const { error } = await supabase
        .from("expense_books")
        .delete()
        .eq("id", bookId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ["books"] });
      }
    },
  });

  const isBookOwner = (book: {
    members: { user_id: string; role: string }[];
  }) => {
    return book.members?.some(
      (m) => m.user_id === user?.id && m.role === "owner",
    );
  };

  return {
    books: booksQuery.data ?? [],
    isLoading: booksQuery.isLoading && isOnline,
    createBook,
    deleteBook,
    isBookOwner,
  };
}
