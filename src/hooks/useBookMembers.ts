import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { withNetworkTimeout } from "@/lib/network";
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
  _offline?: boolean;
}

async function updateCachedBookMembers(
  bookId: string,
  updater: (members: BookMember[]) => BookMember[],
) {
  const cachedBook = await db.books.get(bookId);
  if (!cachedBook) return;

  const bookData = cachedBook.data as Record<string, unknown>;
  const currentMembers = (bookData.members ?? []) as BookMember[];
  const members = updater(currentMembers);

  await db.books.put({
    ...cachedBook,
    data: {
      ...bookData,
      members,
    },
    cachedAt: Date.now(),
  });
}

export function useBookMembers(bookId: string) {
  const { user } = useAuth();
  const { isOnline, queueAction, refreshPendingCount } = useOfflineSync();
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ["book-members", bookId],
    queryFn: async () => {
      const cachedBook = await db.books.get(bookId);
      const fallback = (((cachedBook?.data as Record<string, unknown>)?.members ??
        []) as BookMember[]).map((member, index) => ({
        ...member,
        id:
          member.id ??
          `${bookId}_${member.user_id}_${index}_${member.role}`,
        book_id: member.book_id ?? bookId,
        joined_at: member.joined_at ?? new Date().toISOString(),
      }));

      if (!isOnline) return fallback;

      try {
        const { data: members, error } = await withNetworkTimeout(
          supabase.from("book_members").select("*").eq("book_id", bookId),
        );
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
          const { data: profiles } = await withNetworkTimeout(
            supabase
              .from("profiles")
              .select("user_id, display_name, email, avatar_url")
              .in("user_id", userIds),
          );
          profileMap = new Map(
            profiles?.map((profile) => [profile.user_id, profile]) ?? [],
          );
        }

        const hydrated = members.map((member) => ({
          ...member,
          profile: profileMap.get(member.user_id) ?? null,
          _offline: false,
        })) as BookMember[];

        await updateCachedBookMembers(bookId, () => hydrated);
        return hydrated;
      } catch {
        return fallback;
      }
    },
    enabled: !!bookId && !!user,
  });

  const currentUserRole = membersQuery.data?.find(
    (member) => member.user_id === user?.id,
  )?.role;
  const isOwner = currentUserRole === "owner";

  const addMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const existing = membersQuery.data?.find(
        (member) => member.profile?.email?.toLowerCase() === normalizedEmail,
      );
      if (existing) {
        throw new Error("User is already a member of this book");
      }

      if (!isOnline) {
        const tempId = `temp_member_${crypto.randomUUID()}`;
        const optimisticMember: BookMember = {
          id: tempId,
          book_id: bookId,
          user_id: tempId,
          role,
          joined_at: new Date().toISOString(),
          profile: {
            display_name: null,
            email: normalizedEmail,
            avatar_url: null,
          },
          _offline: true,
        };

        queryClient.setQueryData(
          ["book-members", bookId],
          (old: BookMember[] | undefined) => [...(old ?? []), optimisticMember],
        );
        await updateCachedBookMembers(bookId, (members) => [
          ...members,
          optimisticMember,
        ]);
        await queueAction({
          type: "add_member",
          payload: { bookId, email: normalizedEmail, role },
          tempId: tempId,
          userId: user?.id,
        });
        return;
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
      queryClient.setQueryData(
        ["book-members", bookId],
        (old: BookMember[] | undefined) =>
          (old ?? []).filter((member) => member.id !== memberId),
      );
      await updateCachedBookMembers(bookId, (members) =>
        members.filter((member) => member.id !== memberId),
      );

      if (!isOnline) {
        if (memberId.startsWith("temp_member_")) {
          const queued = await db.syncQueue.toArray();
          const ids = queued
            .filter((action) => action.tempId === memberId)
            .map((action) => action.id);
          if (ids.length > 0) {
            await db.syncQueue.bulkDelete(ids);
            await refreshPendingCount();
          }
          return;
        }

        await queueAction({
          type: "remove_member",
          payload: { memberId },
          userId: user?.id,
        });
        return;
      }

      const { error } = await supabase
        .from("book_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-members", bookId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      queryClient.setQueryData(
        ["book-members", bookId],
        (old: BookMember[] | undefined) =>
          (old ?? []).map((member) =>
            member.id === memberId ? { ...member, role } : member,
          ),
      );
      await updateCachedBookMembers(bookId, (members) =>
        members.map((member) =>
          member.id === memberId ? { ...member, role } : member,
        ),
      );

      if (!isOnline) {
        if (memberId.startsWith("temp_member_")) {
          const queued = await db.syncQueue.toArray();
          const pendingCreate = queued.find(
            (action) =>
              action.type === "add_member" && action.tempId === memberId,
          );
          if (pendingCreate) {
            await db.syncQueue.put({
              ...pendingCreate,
              payload: { ...pendingCreate.payload, role },
            });
            return;
          }
        }

        await queueAction({
          type: "update_member_role",
          payload: { memberId, role },
          userId: user?.id,
        });
        return;
      }

      const { error } = await supabase
        .from("book_members")
        .update({ role })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
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
