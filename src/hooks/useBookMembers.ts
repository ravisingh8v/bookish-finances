import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
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
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ["book-members", bookId],
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("book_members")
        .select("*")
        .eq("book_id", bookId);
      if (error) throw error;

      // Fetch profiles for all member user_ids
      const userIds = members.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);
      return members.map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id) ?? null,
      })) as BookMember[];
    },
    enabled: !!bookId && !!user,
  });

  const currentUserRole = membersQuery.data?.find(
    (m) => m.user_id === user?.id
  )?.role;
  const isOwner = currentUserRole === "owner";

  const addMember = useMutation({
    mutationFn: async ({
      email,
      role,
    }: {
      email: string;
      role: string;
    }) => {
      // Look up user by email
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", email.toLowerCase().trim())
        .single();
      if (profileError || !profile) throw new Error("No user found with that email");

      // Check not already a member
      const existing = membersQuery.data?.find(
        (m) => m.user_id === profile.user_id
      );
      if (existing) throw new Error("User is already a member of this book");

      const { error } = await supabase.from("book_members").insert({
        book_id: bookId,
        user_id: profile.user_id,
        role,
      });
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
      const { error } = await supabase
        .from("book_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-members", bookId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success("Member removed");
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: string;
    }) => {
      const { error } = await supabase
        .from("book_members")
        .update({ role })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-members", bookId] });
      toast.success("Role updated");
    },
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
