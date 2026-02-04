import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import RoleSelectPage from "@/pages/role-select";
import FounderDashboard from "@/pages/founder-dashboard";
import FounderSubmit from "@/pages/founder-submit";
import InvestorDashboard from "@/pages/investor-dashboard";
import InvestorThesis from "@/pages/investor-thesis";
import InvestorSubmit from "@/pages/investor-submit";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminReview from "@/pages/admin-review";
import AdminAnalytics from "@/pages/admin-analytics";
import AdminUsers from "@/pages/admin-users";
import AdminAgents from "@/pages/admin-agents";
import AdminScoring from "@/pages/admin-scoring";
import AdminConversations from "@/pages/admin-conversations";
import AdminScouts from "@/pages/admin-scouts";
import InvestorScoring from "@/pages/investor-scoring";
import ScoutApply from "@/pages/scout-apply";
import ScoutDashboard from "@/pages/scout-dashboard";
import ScoutSubmit from "@/pages/scout-submit";
import InvestorPortal from "@/pages/investor-portal";
import PublicApply from "@/pages/public-apply";
import StartupDetailPage from "@/pages/startup-detail";
import ProfilePage from "@/pages/profile";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
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
  Plus
} from "lucide-react";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Link } from "wouter";
import insideLineLogo from "@assets/Gemini_Generated_Image_dh6rvtdh6rvtdh6r_1769352093821.png";

interface AuthUser {
  id: string;
  username?: string;
  profileImageUrl?: string;
  role?: "founder" | "investor" | "admin" | "scout";
}

function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });
  return { user, isLoading };
}

function AppSidebar({ role }: { role: "founder" | "investor" | "admin" | "scout" }) {
  const [location] = useLocation();
  
  const founderItems = [
    { title: "Dashboard", url: "/founder", icon: Building2 },
    { title: "Submit Startup", url: "/founder/submit", icon: FileText },
  ];

  const investorItems = [
    { title: "Deal Flow", url: "/investor", icon: Target },
    { title: "Investment Thesis", url: "/investor/thesis", icon: Settings },
    { title: "Scoring", url: "/investor/scoring", icon: Scale },
    { title: "Submission Portal", url: "/investor/portal", icon: Link2 },
  ];

  const scoutItems = [
    { title: "Dashboard", url: "/scout", icon: Binoculars },
    { title: "Submit Startup", url: "/scout/submit", icon: Plus },
  ];

  const adminItems = [
    { title: "Review Queue", url: "/admin", icon: Shield },
    { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
    { title: "Users", url: "/admin/users", icon: Users },
    { title: "Scouts", url: "/admin/scouts", icon: Binoculars },
    { title: "Agents", url: "/admin/agents", icon: Bot },
    { title: "Conversations", url: "/admin/conversations", icon: MessageSquare },
    { title: "Scoring", url: "/admin/scoring", icon: Scale },
  ];

  const getItems = () => {
    switch (role) {
      case "admin": return adminItems;
      case "investor": return investorItems;
      case "scout": return scoutItems;
      default: return founderItems;
    }
  };

  const getLabel = () => {
    switch (role) {
      case "admin": return "Admin";
      case "investor": return "Investor Portal";
      case "scout": return "Scout Portal";
      default: return "Founder Portal";
    }
  };

  const items = getItems();
  const label = getLabel();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center" data-testid="link-home">
          <img src={insideLineLogo} alt="Inside Line" className="h-7 w-auto object-contain" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(" ", "-")}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function UserMenu({ user }: { user: AuthUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
          <Avatar className="w-7 h-7">
            <AvatarImage src={user.profileImageUrl} />
            <AvatarFallback>
              {user.username?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline text-sm">{user.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center gap-2" data-testid="menu-profile">
            <User className="w-4 h-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/api/logout" className="flex items-center gap-2 text-destructive" data-testid="menu-logout">
            <LogOut className="w-4 h-4" />
            Log out
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AuthenticatedLayout({ children, role }: { children: React.ReactNode; role: "founder" | "investor" | "admin" | "scout" }) {
  const { user } = useAuth();
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar role={role} />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-40">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <NotificationCenter basePath={`/${role}`} />
              <ThemeToggle />
              {user && <UserMenu user={user} />}
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ProfileWrapper() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  
  if (!user) {
    window.location.href = "/api/login";
    return null;
  }
  
  const role = user.role || "founder";
  
  return (
    <AuthenticatedLayout role={role}>
      <ProfilePage />
    </AuthenticatedLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/apply/:slug" component={PublicApply} />
      <Route path="/select-role" component={RoleSelectPage} />
      <Route path="/profile" component={ProfileWrapper} />
      <Route path="/founder/startup/:id">
        {() => (
          <AuthenticatedLayout role="founder">
            <StartupDetailPage basePath="/founder" />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/founder/submit">
        {() => (
          <AuthenticatedLayout role="founder">
            <FounderSubmit />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/founder">
        {() => (
          <AuthenticatedLayout role="founder">
            <FounderDashboard />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/investor/startup/:id">
        {() => (
          <AuthenticatedLayout role="investor">
            <StartupDetailPage basePath="/investor" />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/investor/submit">
        {() => (
          <AuthenticatedLayout role="investor">
            <InvestorSubmit />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/investor/thesis">
        {() => (
          <AuthenticatedLayout role="investor">
            <InvestorThesis />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/investor/scoring">
        {() => (
          <AuthenticatedLayout role="investor">
            <InvestorScoring />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/investor/portal">
        {() => (
          <AuthenticatedLayout role="investor">
            <InvestorPortal />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/investor">
        {() => (
          <AuthenticatedLayout role="investor">
            <InvestorDashboard />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/admin/startup/:id">
        {() => (
          <AuthenticatedLayout role="admin">
            <AdminReview />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/admin/analytics">
        {() => (
          <AuthenticatedLayout role="admin">
            <AdminAnalytics />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/admin/users">
        {() => (
          <AuthenticatedLayout role="admin">
            <AdminUsers />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/admin/agents">
        {() => (
          <AuthenticatedLayout role="admin">
            <AdminAgents />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/admin/scoring">
        {() => (
          <AuthenticatedLayout role="admin">
            <AdminScoring />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/admin/conversations">
        {() => (
          <AuthenticatedLayout role="admin">
            <AdminConversations />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/admin/scouts">
        {() => (
          <AuthenticatedLayout role="admin">
            <AdminScouts />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/admin">
        {() => (
          <AuthenticatedLayout role="admin">
            <AdminDashboard />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/scout/apply">
        {() => <ScoutApply />}
      </Route>
      <Route path="/scout/submit">
        {() => (
          <AuthenticatedLayout role="scout">
            <ScoutSubmit />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/scout">
        {() => (
          <AuthenticatedLayout role="scout">
            <ScoutDashboard />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="access-layer-theme">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
