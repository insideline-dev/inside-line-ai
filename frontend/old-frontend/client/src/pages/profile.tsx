import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, ArrowLeft, User, Building2, Briefcase, Linkedin, Users, Mail, X, Clock, UserPlus } from "lucide-react";
import { Link } from "wouter";

const profileSchema = z.object({
  companyName: z.string().optional(),
  title: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  bio: z.string().max(500).optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface AuthUser {
  id: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  role?: "founder" | "investor" | "admin" | null;
}

interface UserProfile {
  id: number;
  userId: string;
  role: "founder" | "investor" | "admin";
  companyName?: string | null;
  title?: string | null;
  linkedinUrl?: string | null;
  bio?: string | null;
}

interface TeamInvite {
  id: number;
  email: string;
  role: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  createdAt: string;
  expiresAt: string;
}

interface TeamMember {
  id: number;
  userId: string;
  role: string;
  joinedAt: string;
}

interface TeamData {
  invites: TeamInvite[];
  members: TeamMember[];
}

function TeamInviteSection() {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: teamData, isLoading } = useQuery<TeamData>({
    queryKey: ["/api/investor/team"],
  });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/investor/team/invite", { email });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invite sent",
        description: "Team invitation has been created.",
      });
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/investor/team"] });
    },
    onError: () => {
      toast({
        title: "Failed to send invite",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/investor/team/invite/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invite cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/investor/team"] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/investor/team/member/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Team member removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/investor/team"] });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail.trim()) {
      inviteMutation.mutate(inviteEmail.trim());
    }
  };

  const pendingInvites = teamData?.invites.filter(i => i.status === "pending") || [];
  const members = teamData?.members || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="w-5 h-5" />
          Team Members
        </CardTitle>
        <CardDescription>Invite colleagues to access your investor dashboard</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleInvite} className="flex gap-2">
          <Input
            type="email"
            placeholder="colleague@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1"
            data-testid="input-invite-email"
          />
          <Button 
            type="submit" 
            disabled={inviteMutation.isPending || !inviteEmail.trim()}
            data-testid="button-send-invite"
          >
            {inviteMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            <span className="ml-2 hidden sm:inline">Invite</span>
          </Button>
        </form>

        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {pendingInvites.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending Invites
            </h4>
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div 
                  key={invite.id} 
                  className="flex items-center justify-between p-3 rounded-md border bg-muted/30"
                  data-testid={`invite-pending-${invite.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{invite.email}</span>
                    <Badge variant="secondary" className="text-xs">Pending</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => cancelInviteMutation.mutate(invite.id)}
                    disabled={cancelInviteMutation.isPending}
                    data-testid={`button-cancel-invite-${invite.id}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {members.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Team Members</h4>
            <div className="space-y-2">
              {members.map((member) => (
                <div 
                  key={member.id} 
                  className="flex items-center justify-between p-3 rounded-md border"
                  data-testid={`member-${member.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback>
                        {member.userId.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{member.userId}</span>
                    <Badge variant="outline" className="text-xs capitalize">{member.role}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMemberMutation.mutate(member.id)}
                    disabled={removeMemberMutation.isPending}
                    data-testid={`button-remove-member-${member.id}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoading && pendingInvites.length === 0 && members.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No team members yet. Invite colleagues to collaborate.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const { toast } = useToast();

  const { data: user, isLoading: isUserLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: profile, isLoading: isProfileLoading } = useQuery<UserProfile | null>({
    queryKey: ["/api/profile"],
    retry: false,
    enabled: !!user,
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      companyName: "",
      title: "",
      linkedinUrl: "",
      bio: "",
    },
    values: profile ? {
      companyName: profile.companyName || "",
      title: profile.title || "",
      linkedinUrl: profile.linkedinUrl || "",
      bio: profile.bio || "",
    } : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const response = await apiRequest("PATCH", "/api/profile", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update your profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateMutation.mutate(data);
  };

  if (isUserLoading || isProfileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Please sign in to view your profile.</p>
      </div>
    );
  }

  const displayName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user.username || "User";

  const dashboardPath = user.role === "admin" ? "/admin" : user.role === "investor" ? "/investor" : "/founder";
  const isInvestor = user.role === "investor";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild data-testid="button-back">
          <Link href={dashboardPath}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Profile</h1>
          <p className="text-muted-foreground text-sm">Manage your account settings</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={user.profileImageUrl} />
              <AvatarFallback className="text-xl">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle data-testid="text-user-name">{displayName}</CardTitle>
              <CardDescription data-testid="text-user-email">{user.email}</CardDescription>
              {user.role && (
                <Badge variant="secondary" className="mt-2" data-testid="badge-user-role">
                  {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile Details</CardTitle>
          <CardDescription>Update your professional information</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Company
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Your company name" 
                        {...field} 
                        data-testid="input-company-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Title
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., CEO, Founder, Partner" 
                        {...field} 
                        data-testid="input-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="linkedinUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Linkedin className="w-4 h-4" />
                      LinkedIn URL
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://linkedin.com/in/yourprofile" 
                        {...field} 
                        data-testid="input-linkedin"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Bio
                    </FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Tell us about yourself..." 
                        className="resize-none"
                        rows={4}
                        {...field} 
                        data-testid="input-bio"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4">
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {isInvestor && <TeamInviteSection />}
    </div>
  );
}
