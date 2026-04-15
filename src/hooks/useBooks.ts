import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";
import { getCacheEntry, setCacheEntry } from "@/lib/offlineStore";

const BOOKS_CACHE_KEY = "books";
const PRELOADED_EXPENSES_PER_BOOK = 20;

export function useBooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline, queueAction } = useOfflineSync();

  const updateBooksCache = (updater: (books: any[]) => any[]) => {
    let nextBooks: any[] = [];

    queryClient.setQueryData(["books"], (old: any[] | undefined) => {
      nextBooks = updater(old ?? []);
      return nextBooks;
    });

    void setCacheEntry(BOOKS_CACHE_KEY, nextBooks);
  };

  const preloadRecentExpenses = async (bookIds: string[]) => {
    await Promise.all(
      bookIds.map(async (bookId) => {
        try {
          const { data: expenses, error } = await supabase
            .from("expenses")
            .select("*, categories(name, icon, color)")
            .eq("book_id", bookId)
            .order("created_at", { ascending: false })
            .range(0, PRELOADED_EXPENSES_PER_BOOK - 1);

          if (error) throw error;

          const userIds = [
            ...new Set(
              (expenses ?? [])
                .flatMap((expense) => [expense.created_by, expense.paid_by])
                .filter(Boolean),
            ),
          ];

          let profileMap = new Map<string, { display_name: string | null; email: string | null }>();

          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("user_id, display_name, email")
              .in("user_id", userIds);

            profileMap = new Map(
              profiles?.map((profile) => [profile.user_id, profile]) ?? [],
            );
          }

          const cachedExpenses = (expenses ?? []).map((expense) => ({
            ...expense,
            creator_profile: profileMap.get(expense.created_by) ?? null,
            payer_profile: profileMap.get(expense.paid_by) ?? null,
          }));

          await setCacheEntry(`expenses:${bookId}`, cachedExpenses);
        } catch {
          // Ignore preload failures and keep book loading fast.
        }
      }),
    );
  };

  const booksQuery = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const cachedBooks = await getCacheEntry<any[]>(BOOKS_CACHE_KEY);

      if (!isOnline) {
        return cachedBooks ?? [];
      }

      try {
        const { data, error } = await supabase
          .from("expense_books")
          .select(
            "*, members:book_members(user_id, role), my_access:book_members!inner(user_id, role)",
          )
          .order("created_at", { ascending: false })
          .eq("my_access.user_id", user!.id);

        if (error) throw error;

        void setCacheEntry(BOOKS_CACHE_KEY, data);
        void preloadRecentExpenses(data.map((book) => book.id));

        return data;
      } catch (error) {
        if (cachedBooks) return cachedBooks;
        throw error;
      }
    },
    enabled: !!user,
  });

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

        updateBooksCache((old) => [tempBook, ...old]);
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

        updateBooksCache((old) => old.filter((book) => book.id !== bookId));
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
