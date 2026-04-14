import { useState } from "react";
import { useBookMembers, BookMember } from "@/hooks/useBookMembers";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPlus, MoreVertical, Crown, Pencil, Eye, LogOut, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ROLE_CONFIG = {
  owner: { label: "Owner", icon: Crown, color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  editor: { label: "Editor", icon: Pencil, color: "bg-primary/10 text-primary border-primary/20" },
  viewer: { label: "Viewer", icon: Eye, color: "bg-muted text-muted-foreground border-border" },
};

function getInitials(name?: string | null, email?: string | null) {
  if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  if (email) return email[0].toUpperCase();
  return "?";
}

export function BookMembers({ bookId }: { bookId: string }) {
  const { user } = useAuth();
  const { members, isOwner, addMember, removeMember, updateRole } = useBookMembers(bookId);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");

  const handleAdd = async () => {
    if (!email.trim()) {
      toast.error("Please enter an email");
      return;
    }
    try {
      await addMember.mutateAsync({ email: email.trim(), role });
      setOpen(false);
      setEmail("");
      setRole("editor");
    } catch {}
  };

  const handleRemove = (member: BookMember) => {
    const isSelf = member.user_id === user?.id;
    const msg = isSelf ? "Leave this book?" : `Remove ${member.profile?.display_name || member.profile?.email}?`;
    if (confirm(msg)) removeMember.mutate(member.id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Members ({members.length})
        </h3>
        {isOwner && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor — can add & edit expenses</SelectItem>
                      <SelectItem value="viewer">Viewer — read only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={handleAdd}
                  disabled={addMember.isPending}
                >
                  {addMember.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Send Invite
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-1.5">
        {members.map((member) => {
          const rc = ROLE_CONFIG[member.role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.viewer;
          const isSelf = member.user_id === user?.id;

          return (
            <div
              key={member.id}
              className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {getInitials(member.profile?.display_name, member.profile?.email)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {member.profile?.display_name || member.profile?.email || "Unknown"}
                  {isSelf && <span className="text-muted-foreground ml-1">(you)</span>}
                </p>
                {member.profile?.email && member.profile?.display_name && (
                  <p className="text-xs text-muted-foreground truncate">{member.profile.email}</p>
                )}
              </div>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${rc.color}`}>
                {rc.label}
              </Badge>
              {(isOwner && !isSelf) || (isSelf && member.role !== "owner") ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwner && !isSelf && (
                      <>
                        <DropdownMenuItem onClick={() => updateRole.mutate({ memberId: member.id, role: "editor" })}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Set as Editor
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateRole.mutate({ memberId: member.id, role: "viewer" })}>
                          <Eye className="h-3.5 w-3.5 mr-2" />
                          Set as Viewer
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleRemove(member)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </>
                    )}
                    {isSelf && member.role !== "owner" && (
                      <DropdownMenuItem
                        onClick={() => handleRemove(member)}
                        className="text-destructive"
                      >
                        <LogOut className="h-3.5 w-3.5 mr-2" />
                        Leave Book
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
