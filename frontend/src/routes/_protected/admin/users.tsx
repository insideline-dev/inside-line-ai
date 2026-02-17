import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { customFetch } from "@/api/client";
import { useAdminControllerGetUsers } from "@/api/generated/admin/admin";

export const Route = createFileRoute("/_protected/admin/users")({
  component: UserManagement,
});

interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  role?: string;
  profile?: {
    companyName?: string;
  };
  createdAt: string;
}

interface EarlyAccessInvite {
  id: string;
  email: string;
  role: "founder" | "investor" | "scout";
  status: "pending" | "redeemed" | "revoked" | "expired";
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
  inviteUrl?: string;
}

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  companyName: string;
  role: string;
  website: string;
  createdAt: string;
}

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  founder: "bg-blue-100 text-blue-800",
  investor: "bg-green-100 text-green-800",
  scout: "bg-purple-100 text-purple-800",
};

const inviteStatusColors: Record<EarlyAccessInvite["status"], string> = {
  pending: "bg-yellow-100 text-yellow-800",
  redeemed: "bg-green-100 text-green-800",
  revoked: "bg-gray-100 text-gray-800",
  expired: "bg-red-100 text-red-800",
};

const inviteRoleLabels: Record<EarlyAccessInvite["role"], string> = {
  founder: "Founder",
  investor: "Investor",
  scout: "Scout",
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function UserManagement() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<EarlyAccessInvite["role"]>("founder");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);

  const { data: response, isLoading: usersLoading, error: usersError } =
    useAdminControllerGetUsers();
  const users = (response?.data as User[] | undefined) ?? [];

  const invitesQuery = useQuery({
    queryKey: ["admin", "early-access", "invites"],
    queryFn: () =>
      customFetch<EarlyAccessInvite[]>("/admin/early-access/invites"),
  });

  const waitlistQuery = useQuery({
    queryKey: ["admin", "early-access", "waitlist"],
    queryFn: () =>
      customFetch<WaitlistEntry[]>("/admin/early-access/waitlist"),
  });

  const createInviteMutation = useMutation({
    mutationFn: () =>
      customFetch<EarlyAccessInvite>("/admin/early-access/invites", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          expiresInDays: Number(expiresInDays || "7"),
        }),
      }),
    onSuccess: (invite) => {
      setLatestInviteUrl(invite.inviteUrl || null);
      setInviteEmail("");
      queryClient.invalidateQueries({
        queryKey: ["admin", "early-access", "invites"],
      });
      toast.success("Invite generated");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to generate invite");
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) =>
      customFetch<{ success: true; message: string }>(
        `/admin/early-access/invites/${id}/revoke`,
        {
          method: "POST",
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "early-access", "invites"],
      });
      toast.success("Invite revoked");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to revoke invite");
    },
  });

  const copyInviteLink = async () => {
    if (!latestInviteUrl) {
      return;
    }

    await navigator.clipboard.writeText(latestInviteUrl);
    toast.success("Invite link copied");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground">
          Manage users, early-access invites, and the waitlist
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate Early-Access Invite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1.2fr_180px_180px_auto]">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Invitee email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                placeholder="invitee@example.com"
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) =>
                  setInviteRole(value as EarlyAccessInvite["role"])
                }
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="founder">Founder</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                  <SelectItem value="scout">Scout</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-expiry">Invite expiry (days)</Label>
              <Input
                id="invite-expiry"
                type="number"
                min={1}
                max={90}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button
                disabled={!inviteEmail || createInviteMutation.isPending}
                onClick={() => createInviteMutation.mutate()}
              >
                {createInviteMutation.isPending ? "Generating..." : "Generate Link"}
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Example: <code>7</code> means the invite link expires 7 days after it is
            created.
          </p>

          {latestInviteUrl && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm text-muted-foreground">Latest invite link</p>
              <p className="text-sm break-all">{latestInviteUrl}</p>
              <Button variant="outline" size="sm" onClick={copyInviteLink}>
                Copy Link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Early-Access Invites</CardTitle>
        </CardHeader>
        <CardContent>
          {invitesQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : invitesQuery.error ? (
            <p className="text-sm text-destructive">
              Failed to load invites: {(invitesQuery.error as Error).message}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Role
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Expires
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Created
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(invitesQuery.data || []).map((invite) => (
                    <tr key={invite.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-3">{invite.email}</td>
                      <td className="py-3 px-3">
                        <Badge
                          className={inviteStatusColors[invite.status]}
                          variant="outline"
                        >
                          {invite.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">{inviteRoleLabels[invite.role]}</td>
                      <td className="py-3 px-3">{formatDate(invite.expiresAt)}</td>
                      <td className="py-3 px-3">{formatDate(invite.createdAt)}</td>
                      <td className="py-3 px-3">
                        {invite.status === "pending" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={revokeInviteMutation.isPending}
                            onClick={() => revokeInviteMutation.mutate(invite.id)}
                          >
                            Revoke
                          </Button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Waitlist</CardTitle>
        </CardHeader>
        <CardContent>
          {waitlistQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : waitlistQuery.error ? (
            <p className="text-sm text-destructive">
              Failed to load waitlist: {(waitlistQuery.error as Error).message}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Company
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Role
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Website
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                      Added
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(waitlistQuery.data || []).map((entry) => (
                    <tr key={entry.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-3">{entry.name}</td>
                      <td className="py-3 px-3">{entry.email}</td>
                      <td className="py-3 px-3">{entry.companyName}</td>
                      <td className="py-3 px-3">{entry.role}</td>
                      <td className="py-3 px-3">
                        <a
                          href={entry.website}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {entry.website}
                        </a>
                      </td>
                      <td className="py-3 px-3">{formatDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : usersError ? (
            <div className="py-12 text-center text-destructive">
              Failed to load users: {(usersError as Error).message}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Name
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Role
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Company
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Created At
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {user.image && (
                            <img
                              src={user.image}
                              alt={user.name}
                              className="h-8 w-8 rounded-full"
                            />
                          )}
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="py-3 px-4">
                        {user.role && (
                          <Badge
                            className={roleColors[user.role] || "bg-gray-100 text-gray-800"}
                            variant="outline"
                          >
                            {user.role}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {user.profile?.companyName || "-"}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
