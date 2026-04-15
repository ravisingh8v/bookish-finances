import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";
import { toast } from "sonner";

export interface BookMember {
  id: string;
  book_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: {
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

export function useBookMembers(bookId: string) {
  const { user } = useAuth();
  const { isOnline, queueAction } = useOfflineSync();
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ["book-members", bookId],
    queryFn: async () => {
      // Fallback from book cache
      const cachedBook = await db.books.get(bookId);
      const fallback: BookMember[] = ((cachedBook?.data as Record<string, unknown>)?.members as { user_id: string; role: string }[] ?? []).map((m, i) => ({
        id: `${bookId}-${m.user_id}-${i}`,
        book_id: bookId,
        user_id: m.user_id,
        role: m.role,
        joined_at: (cachedBook?.data as Record<string, unknown>)?.created_at as string ?? new Date().toISOString(),
        profile: null,
      }));

      if (!isOnline) return fallback;

      try {
        const { data: members, error } = await supabase.from("book_members").select("*").eq("book_id", bookId);
        if (error) throw error;

        const userIds = members.map((m) => m.user_id);
        let profileMap = new Map<string, { display_name: string | null; email: string | null; avatar_url: string | null }>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, email, avatar_url").in("user_id", userIds);
          profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);
        }

        return members.map((m) => ({ ...m, profile: profileMap.get(m.user_id) ?? null })) as BookMember[];
      } catch {
        return fallback;
      }
    },
    enabled: !!bookId && !!user,
  });

  const currentUserRole = membersQuery.data?.find((m) => m.user_id === user?.id)?.role;
  const isOwner = currentUserRole === "owner";

  const addMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const { data: profile, error: profileError } = await supabase.from("profiles").select("user_id").eq("email", email.toLowerCase().trim()).single();
      if (profileError || !profile) throw new Error("No user found with that email");
      const existing = membersQuery.data?.find((m) => m.user_id === profile.user_id);
      if (existing) throw new Error("User is already a member of this book");

      if (!isOnline) {
        await queueAction({ type: "add_member", payload: { bookId, userId: profile.user_id, role }, userId: user?.id });
        return;
      }

      const { error } = await supabase.from("book_members").insert({ book_id: bookId, user_id: profile.user_id, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-members", bookId] });
      toast.success("Member added!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      if (!isOnline) {
        await queueAction({ type: "remove_member", payload: { memberId }, userId: user?.id });
        queryClient.setQueryData(["book-members", bookId], (old: BookMember[] | undefined) =>
          (old ?? []).filter((m) => m.id !== memberId)
        );
        return;
      }
      const { error } = await supabase.from("book_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-members", bookId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      queryClient.setQueryData(["book-members", bookId], (old: BookMember[] | undefined) =>
        (old ?? []).map((m) => (m.id === memberId ? { ...m, role } : m))
      );

      if (!isOnline) {
        await queueAction({ type: "update_member_role", payload: { memberId, role }, userId: user?.id });
        return;
      }
      const { error } = await supabase.from("book_members").update({ role }).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["book-members", bookId] }),
  });

  return {
    members: membersQuery.data ?? [],
    isLoading: membersQuery.isLoading,
    isOwner,
    currentUserRole,
    addMember,
    removeMember,
    updateRole,
  };
}
