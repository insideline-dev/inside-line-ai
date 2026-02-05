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

  const onboardingExemptPaths = ["/role-select", "/scout/apply"];
  const needsOnboarding =
    !isMockAuth &&
    isAuthed &&
    !user.onboardingCompleted &&
    !onboardingExemptPaths.includes(window.location.pathname);

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

  // Show nothing while loading, redirecting to login, or redirecting to onboarding
  if (isLoading || !isAuthed || needsOnboarding) {
    return null;
  }

  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
