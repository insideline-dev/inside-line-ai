import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCurrentUser, AuthProvider } from "@/lib/auth";
import { env } from "@/env";

export const Route = createFileRoute("/_protected")({
  component: ProtectedContent,
});

function ProtectedContent() {
  const navigate = useNavigate();
  const { data: user, isLoading } = useCurrentUser();
  const isAuthed = !!user;
  const isMockAuth = env.VITE_MOCK_AUTH;

  useEffect(() => {
    if (isMockAuth) return;
    if (!isLoading && !isAuthed) {
      const redirectPath = `${window.location.pathname}${window.location.search}`;
      navigate({
        to: "/login",
        search: () => ({ redirect: redirectPath }),
        replace: true,
      });
    }
  }, [isLoading, isAuthed, isMockAuth, navigate]);

  // Mock auth bypass - skip all auth checks
  if (isMockAuth) {
    return (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    );
  }

  // Block dashboard flash until session resolves
  if (isLoading || !isAuthed) {
    return null;
  }

  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
