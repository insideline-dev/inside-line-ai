import { Outlet, createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { ModalProvider } from "@/contexts/ModalContext";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, ListTodo, CheckCircle2 } from "lucide-react";

// Navigation tabs
const navTabs = [
  { id: "todos", label: "Current Todos", to: "/todos", icon: ListTodo },
  { id: "done", label: "Done Todos", to: "/done", icon: CheckCircle2 },
  { id: "settings", label: "Settings", to: "/settings", icon: Settings },
];

export const Route = createFileRoute("/_protected/_layout")({
  component: ProtectedLayout,
});

function ProtectedLayout() {
  const location = useLocation();
  const { user } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <ModalProvider>
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-6xl flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/todos" className="font-bold text-xl">
              Tandem
            </Link>
          </div>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.image || undefined} alt={user?.name || "User"} />
                  <AvatarFallback>{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="border-b bg-background">
        <div className="container mx-auto max-w-6xl px-4">
          <nav className="flex gap-6">
            {navTabs.map((tab) => {
              const isActive = location.pathname === tab.to || location.pathname.startsWith(tab.to + "/");
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.id}
                  to={tab.to}
                  className={cn(
                    "flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto max-w-6xl py-6 px-4">
        <Outlet />
      </main>
    </ModalProvider>
  );
}

