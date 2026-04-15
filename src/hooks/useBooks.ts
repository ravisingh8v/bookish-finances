import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";

const MAX_BOOKS_CACHE = 10;

export function useBooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline, queueAction, cancelQueuedCreate, beginWrite, endWrite } = useOfflineSync();

  const booksQuery = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const cached = await db.books.orderBy("cachedAt").reverse().limit(MAX_BOOKS_CACHE).toArray();
      const cachedBooks = cached.map((c) => c.data);

      if (!isOnline) return cachedBooks;

      try {
        const { data, error } = await supabase
          .from("expense_books")
          .select("*, members:book_members(user_id, role), my_access:book_members!inner(user_id, role)")
          .order("created_at", { ascending: false })
          .eq("my_access.user_id", user!.id);
        if (error) throw error;

        await db.books.clear();
        for (const book of (data ?? []).slice(0, MAX_BOOKS_CACHE)) {
          await db.books.put({ id: book.id, data: book, cachedAt: Date.now() });
        }

        preloadExpenses(data?.map((b) => b.id) ?? []);

        return data ?? [];
      } catch {
        return cachedBooks;
      }
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const createBook = useMutation({
    mutationFn: async (book: { name: string; description?: string; currency?: string; color?: string; icon?: string }) => {
      beginWrite();
      try {
        const tempId = `temp_${crypto.randomUUID()}`;
        const tempBook = {
          id: tempId,
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
          _offline: !isOnline,
        };

        await db.books.put({ id: tempId, data: tempBook, cachedAt: Date.now() });
        queryClient.setQueryData(["books"], (old: unknown[] | undefined) => [tempBook, ...(old ?? [])]);

        if (!isOnline) {
          await queueAction({ type: "create_book", payload: { ...book, tempId }, tempId, userId: user?.id });
          return tempBook;
        }

        const { data, error } = await supabase.from("expense_books")
          .insert({ ...book, created_by: user!.id }).select().single();
        if (error) throw error;

        await supabase.from("book_members").insert({ book_id: data.id, user_id: user!.id, role: "owner" });

        await db.books.delete(tempId);
        await db.books.put({ id: data.id, data: { ...data, members: [{ user_id: user?.id, role: "owner" }], my_access: [{ user_id: user?.id, role: "owner" }] }, cachedAt: Date.now() });

        return data;
      } finally {
        endWrite();
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["books"] }),
  });

  const updateBook = useMutation({
    mutationFn: async (params: { bookId: string; name?: string; description?: string; currency?: string; color?: string; icon?: string }) => {
      beginWrite();
      try {
        const cached = await db.books.get(params.bookId);
        if (cached) {
          await db.books.put({ ...cached, data: { ...cached.data, ...params }, cachedAt: Date.now() });
        }
        queryClient.setQueryData(["books"], (old: unknown[] | undefined) =>
          (old ?? []).map((b: Record<string, unknown>) => b.id === params.bookId ? { ...b, ...params } : b)
        );

        if (!isOnline) {
          await queueAction({ type: "update_book", payload: params, userId: user?.id });
          return;
        }

        // Can't update a temp-ID book on the server
        if (params.bookId.startsWith("temp_")) return;

        const { error } = await supabase.from("expense_books").update({ name: params.name, description: params.description, currency: params.currency, color: params.color, icon: params.icon }).eq("id", params.bookId);
        if (error) throw error;
      } finally {
        endWrite();
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["books"] }),
  });

  const deleteBook = useMutation({
    mutationFn: async (bookId: string) => {
      beginWrite();
      try {
        const isTempId = bookId.startsWith("temp_");

        // Optimistic remove
        await db.books.delete(bookId);
        await db.expenses.delete(bookId);
        queryClient.setQueryData(["books"], (old: unknown[] | undefined) =>
          (old ?? []).filter((b: Record<string, unknown>) => b.id !== bookId)
        );

        if (isTempId) {
          // Book was never synced — cancel its queued create, no server delete needed
          await cancelQueuedCreate(bookId);
          return;
        }

        if (!isOnline) {
          await queueAction({ type: "delete_book", payload: { bookId }, userId: user?.id });
          return;
        }

        const { error } = await supabase.from("expense_books").delete().eq("id", bookId);
        if (error) throw error;
      } finally {
        endWrite();
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["books"] }),
  });

  const isBookOwner = (book: { members: { user_id: string; role: string }[] }) =>
    book.members?.some((m) => m.user_id === user?.id && m.role === "owner");

  return {
    books: booksQuery.data ?? [],
    isLoading: booksQuery.isLoading && isOnline,
    createBook,
    updateBook,
    deleteBook,
    isBookOwner,
  };
}

async function preloadExpenses(bookIds: string[]) {
  await Promise.all(bookIds.slice(0, MAX_BOOKS_CACHE).map(async (bookId) => {
    try {
      const { data: expenses, error } = await supabase
        .from("expenses")
        .select("*, categories(name, icon, color)")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return;

      const userIds = [...new Set((expenses ?? []).flatMap((e) => [e.created_by, e.paid_by]).filter(Boolean))];
      let profileMap = new Map<string, { display_name: string | null; email: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, email").in("user_id", userIds);
        profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);
      }

      const withProfiles = (expenses ?? []).map((e) => ({
        ...e,
        creator_profile: profileMap.get(e.created_by) ?? null,
        payer_profile: profileMap.get(e.paid_by) ?? null,
      }));

      await db.expenses.put({ id: bookId, expenses: withProfiles, cachedAt: Date.now() });
    } catch { /* ignore preload failures */ }
  }));
}
