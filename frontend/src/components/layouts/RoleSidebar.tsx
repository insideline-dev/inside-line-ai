import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationCenter } from "@/components/NotificationCenter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Building2,
  FileText,
  Target,
  Users,
  BarChart3,
  Settings,
  LogOut,
  User,
  Shield,
  Bot,
  Scale,
  Link2,
  MessageSquare,
  Binoculars,
  Workflow,
  Plus,
  ChevronsUpDown,
  Calendar,
  Folder,
  Handshake,
  DollarSign,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useAuth, useLogout } from "@/lib/auth";
import type { UserRole } from "@/types";
import { useMockAuthStore } from "@/stores";
import { env } from "@/env";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

const roleNavItems: Record<UserRole, NavItem[]> = {
  founder: [
    { title: "Dashboard", url: "/founder", icon: Building2 },
    { title: "Submit Startup", url: "/founder/submit", icon: FileText },
    { title: "Data Room", url: "/founder/data-room", icon: Folder },
    { title: "Investor Interest", url: "/founder/investor-interest", icon: Handshake },
    { title: "Meetings", url: "/founder/meetings", icon: Calendar },
  ],
  investor: [
    { title: "Pipeline", url: "/investor", icon: Target },
    { title: "Investment Thesis", url: "/investor/thesis", icon: Settings },
    { title: "Scoring", url: "/investor/scoring", icon: Scale },
    { title: "Submission Portal", url: "/investor/portal", icon: Link2 },
  ],
  admin: [
    { title: "Review Queue", url: "/admin", icon: Shield },
    { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
    { title: "Users", url: "/admin/users", icon: Users },
    { title: "Scouts", url: "/admin/scouts", icon: Binoculars },
    { title: "Agents", url: "/admin/agents", icon: Bot },
    { title: "Flow", url: "/admin/flow", icon: Workflow },
    { title: "Conversations", url: "/admin/conversations", icon: MessageSquare },
    { title: "Scoring", url: "/admin/scoring", icon: Scale },
    { title: "Integrations", url: "/admin/integrations", icon: Link2 },
  ],
  scout: [
    { title: "Dashboard", url: "/scout", icon: Binoculars },
    { title: "Submit Startup", url: "/scout/submit", icon: Plus },
    { title: "Commissions", url: "/scout/commissions", icon: DollarSign },
    { title: "Metrics", url: "/scout/metrics", icon: BarChart3 },
    { title: "Leaderboard", url: "/scout/leaderboard", icon: Trophy },
  ],
};

const roleLabels: Record<UserRole, string> = {
  founder: "Founder Portal",
  investor: "Investor Portal",
  admin: "Admin",
  scout: "Scout Portal",
};

interface RoleSidebarProps {
  role: UserRole;
  children: React.ReactNode;
}

function NavContent({ role }: { role: UserRole }) {
  const location = useLocation();
  const items = roleNavItems[role];
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{roleLabels[role]}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isRoleIndex = ["/investor", "/founder", "/admin", "/scout"].includes(item.url);
            const isActive = isRoleIndex
              ? location.pathname === item.url
              : location.pathname === item.url || location.pathname.startsWith(item.url + "/");

            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.title}
                  onClick={() => setOpenMobile(false)}
                >
                  <Link to={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function UserMenu() {
  const { user } = useAuth();
  const { currentRole, setRole } = useMockAuthStore();
  const navigate = useNavigate();
  const isMockAuth = env.VITE_MOCK_AUTH;
  const logoutMutation = useLogout();
  const allRoles: UserRole[] = ["founder", "investor", "admin", "scout"];

  const handleSignOut = () => {
    logoutMutation.mutate();
  };

  const handleRoleSwitch = (role: UserRole) => {
    setRole(role);
    navigate({ to: `/${role}` });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarImage src={user?.image || undefined} />
            <AvatarFallback className="rounded-lg">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{user?.name || "User"}</span>
            <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
        side="bottom"
        align="end"
        sideOffset={4}
      >
        <DropdownMenuItem asChild>
          <Link to="/profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        {isMockAuth && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Switch Role (Demo)</div>
            {allRoles.map((r) => (
              <DropdownMenuItem
                key={r}
                onClick={() => handleRoleSwitch(r)}
                className={cn(currentRole === r && "bg-accent")}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSidebar({ role }: { role: UserRole }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Shield className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Inside Line</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavContent role={role} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function RoleSidebar({ role, children }: RoleSidebarProps) {
  return (
    <SidebarProvider>
      <AppSidebar role={role} />
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
