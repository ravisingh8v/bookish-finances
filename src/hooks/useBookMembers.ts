import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";

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
  } | null;
}

function assertOnline(isOnline: boolean) {
  if (!isOnline) {
    throw new Error("You're offline. Connect to the internet to continue.");
  }
}

export function useBookMembers(bookId: string) {
  const { user } = useAuth();
  const { isOnline } = useOfflineSync();
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ["book-members", bookId],
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("book_members")
        .select("*")
        .eq("book_id", bookId);
      if (error) throw error;

      const userIds = members.map((member) => member.user_id);
      let profileMap = new Map<
        string,
        {
          display_name: string | null;
          email: string | null;
          avatar_url: string | null;
        }
      >();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, email, avatar_url")
          .in("user_id", userIds);
        profileMap = new Map(
          profiles?.map((profile) => [profile.user_id, profile]) ?? [],
        );
      }

      return members.map((member) => ({
        ...member,
        profile: profileMap.get(member.user_id) ?? null,
      })) as BookMember[];
    },
    enabled: !!bookId && !!user && isOnline,
  });

  useEffect(() => {
    if (!bookId || !user) return;
    const channel = supabase
      .channel(`book-members-${bookId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "book_members",
          filter: `book_id=eq.${bookId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["book-members", bookId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookId, user, queryClient]);

  const currentUserRole = membersQuery.data?.find(
    (member) => member.user_id === user?.id,
  )?.role;
  const isOwner = currentUserRole === "owner";

  const addMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      assertOnline(isOnline);
      const normalizedEmail = email.toLowerCase().trim();
      const existing = membersQuery.data?.find(
        (member) => member.profile?.email?.toLowerCase() === normalizedEmail,
      );
      if (existing) {
        throw new Error("User is already a member of this book");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, display_name, email, avatar_url")
        .eq("email", normalizedEmail)
        .single();
      if (profileError || !profile) {
        throw new Error("No user found with that email");
      }

      const { error } = await supabase.from("book_members").insert({
        book_id: bookId,
        user_id: profile.user_id,
        role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-members", bookId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success("Member added");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      assertOnline(isOnline);
      const { error } = await supabase
        .from("book_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onMutate: (memberId: string) => {
      queryClient.setQueryData(
        ["book-members", bookId],
        (old: BookMember[] | undefined) =>
          (old ?? []).filter((member) => member.id !== memberId),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["book-members", bookId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
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
      assertOnline(isOnline);
      const { error } = await supabase
        .from("book_members")
        .update({ role })
        .eq("id", memberId);
      if (error) throw error;
    },
    onMutate: ({ memberId, role }: { memberId: string; role: string }) => {
      queryClient.setQueryData(
        ["book-members", bookId],
        (old: BookMember[] | undefined) =>
          (old ?? []).map((member) =>
            member.id === memberId ? { ...member, role } : member,
          ),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["book-members", bookId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
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
