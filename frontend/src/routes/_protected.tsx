import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { env } from "@/env";

export const Route = createFileRoute("/_protected")({
  component: ProtectedContent,
});

function ProtectedContent() {
  const navigate = useNavigate();
  const { data, isPending } = useSession();
  const isAuthed = !!data?.user && !!data?.session;
  const isMockAuth = env.VITE_MOCK_AUTH;

  useEffect(() => {
    if (isMockAuth) return;
    if (!isPending && !isAuthed) {
      const redirectPath = `${window.location.pathname}${window.location.search}`;
      navigate({
        to: "/login",
        search: () => ({ redirect: redirectPath }),
        replace: true,
      });
    }
  }, [isPending, isAuthed, isMockAuth, navigate]);

  // Mock auth bypass - skip all auth checks
  if (isMockAuth) {
    return (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    );
  }

  // Block dashboard flash until session resolves
  if (isPending || !isAuthed) {
    return null;
  }

  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

