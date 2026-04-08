import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useBooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const booksQuery = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_books")
        .select("*, book_members(user_id, role)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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
      const { data, error } = await supabase
        .from("expense_books")
        .insert({ ...book, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;

      // Add creator as owner
      await supabase
        .from("book_members")
        .insert({ book_id: data.id, user_id: user!.id, role: "owner" });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["books"] }),
  });

  const deleteBook = useMutation({
    mutationFn: async (bookId: string) => {
      const { error } = await supabase
        .from("expense_books")
        .delete()
        .eq("id", bookId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["books"] }),
  });

  // Helper: check if current user is owner of a book
  const isBookOwner = (book: { book_members: { user_id: string; role: string }[] }) => {
    return book.book_members?.some(
      (m) => m.user_id === user?.id && m.role === "owner"
    );
  };

  return {
    books: booksQuery.data ?? [],
    isLoading: booksQuery.isLoading,
    createBook,
    deleteBook,
    isBookOwner,
  };
}
