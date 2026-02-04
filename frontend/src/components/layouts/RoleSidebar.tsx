import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationCenter } from "@/components/NotificationCenter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetHeader } from "@/components/ui/sheet";
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
  Plus,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/hooks/useAuth";
import type { UserRole } from "@/types";
import { useMockAuthStore } from "@/stores";
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
  ],
  investor: [
    { title: "Deal Flow", url: "/investor", icon: Target },
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
    { title: "Conversations", url: "/admin/conversations", icon: MessageSquare },
    { title: "Scoring", url: "/admin/scoring", icon: Scale },
  ],
  scout: [
    { title: "Dashboard", url: "/scout", icon: Binoculars },
    { title: "Submit Startup", url: "/scout/submit", icon: Plus },
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

function NavContent({ role, onItemClick }: { role: UserRole; onItemClick?: () => void }) {
  const location = useLocation();
  const items = roleNavItems[role];

  return (
    <nav className="space-y-1 px-2">
      <div className="mb-4 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {roleLabels[role]}
      </div>
      {items.map((item) => {
        // Index routes (role home pages) need exact match to avoid highlighting when on sub-routes
        const isRoleIndex = ["/investor", "/founder", "/admin", "/scout"].includes(item.url);
        const isActive = isRoleIndex
          ? location.pathname === item.url
          : location.pathname === item.url || location.pathname.startsWith(item.url + "/");
        return (
          <Link
            key={item.url}
            to={item.url}
            onClick={onItemClick}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { user } = useAuth();
  const { currentRole, setRole } = useMockAuthStore();
  const navigate = useNavigate();
  const allRoles: UserRole[] = ["founder", "investor", "admin", "scout"];

  const handleSignOut = async () => {
    await signOut();
  };

  const handleRoleSwitch = (role: UserRole) => {
    setRole(role);
    navigate({ to: `/${role}` });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={user?.image || undefined} />
            <AvatarFallback>{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
          </Avatar>
          <span className="hidden md:inline text-sm truncate max-w-[100px]">{user?.name || "User"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm font-medium">{user?.email}</div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RoleSidebar({ role, children }: RoleSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-background border-r">
        <div className="flex h-14 items-center border-b px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Shield className="h-6 w-6 text-primary" />
            <span>Inside Line</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-4">
          <NavContent role={role} />
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col md:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
          {/* Mobile Menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
                <SheetDescription>Navigation menu</SheetDescription>
              </SheetHeader>
              <div className="flex h-14 items-center border-b px-4">
                <Link to="/" className="flex items-center gap-2 font-semibold">
                  <Shield className="h-6 w-6 text-primary" />
                  <span>Inside Line</span>
                </Link>
              </div>
              <div className="py-4">
                <NavContent role={role} onItemClick={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex-1" />

          {/* Right side header items */}
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
