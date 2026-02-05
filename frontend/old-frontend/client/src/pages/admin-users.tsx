import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Shield, Building2, Target, Binoculars } from "lucide-react";

interface UserProfile {
  id: number;
  userId: string;
  role: "founder" | "investor" | "admin" | "scout";
  companyName: string | null;
  title: string | null;
  createdAt: string;
  user?: {
    username: string;
    profileImageUrl: string | null;
  };
}

export default function AdminUsers() {
  const { data: users, isLoading } = useQuery<UserProfile[]>({
    queryKey: ["/api/admin/users"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage platform users</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const userList = users || [];

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Shield className="w-3 h-3" />;
      case "investor":
        return <Target className="w-3 h-3" />;
      case "scout":
        return <Binoculars className="w-3 h-3" />;
      default:
        return <Building2 className="w-3 h-3" />;
    }
  };

  const getRoleVariant = (role: string): "default" | "secondary" | "outline" => {
    switch (role) {
      case "admin":
        return "default";
      case "investor":
        return "secondary";
      case "scout":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Users</h1>
          <p className="text-muted-foreground">Manage platform users</p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {userList.length} users
        </Badge>
      </div>

      <div className="grid gap-4">
        {userList.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No users found</h3>
              <p className="text-sm text-muted-foreground">
                Users will appear here once they sign up
              </p>
            </CardContent>
          </Card>
        ) : (
          userList.map((profile) => (
            <Card key={profile.id} data-testid={`card-user-${profile.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarImage src={profile.user?.profileImageUrl || undefined} />
                      <AvatarFallback>
                        {profile.user?.username?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium" data-testid={`text-username-${profile.id}`}>
                          {profile.user?.username || `User ${profile.userId}`}
                        </span>
                        <Badge variant={getRoleVariant(profile.role)} className="flex items-center gap-1">
                          {getRoleIcon(profile.role)}
                          {profile.role}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        {profile.companyName && (
                          <span>{profile.companyName}</span>
                        )}
                        {profile.title && profile.companyName && (
                          <span>-</span>
                        )}
                        {profile.title && (
                          <span>{profile.title}</span>
                        )}
                        {!profile.companyName && !profile.title && (
                          <span>No profile details</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Joined {new Date(profile.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
