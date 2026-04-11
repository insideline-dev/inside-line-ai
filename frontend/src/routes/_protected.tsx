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

  const pathname = window.location.pathname;
  const onboardingExemptPaths = ["/role-select", "/scout/apply"];
  const needsOnboarding =
    !isMockAuth &&
    isAuthed &&
    !user.onboardingCompleted &&
    !onboardingExemptPaths.includes(pathname);

  const shouldRedirectToLogin = !isMockAuth && !isLoading && !isAuthed;

  useEffect(() => {
    if (shouldRedirectToLogin) {
      const redirectPath = `${window.location.pathname}${window.location.search}`;
      navigate({
        to: "/login",
        search: () => ({ redirect: redirectPath }),
        replace: true,
      });
    }
  }, [shouldRedirectToLogin, navigate]);

  useEffect(() => {
    if (needsOnboarding) {
      navigate({ to: "/role-select", replace: true });
    }
  }, [needsOnboarding, navigate]);

  // Mock auth bypass - skip all auth checks
  if (isMockAuth) {
    return (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    );
  }

  if (isLoading || !isAuthed || needsOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
