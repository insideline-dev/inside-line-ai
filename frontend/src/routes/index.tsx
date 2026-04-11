import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/auth";
import { env } from "@/env";
import { useMockAuthStore } from "@/stores";

export const Route = createFileRoute("/")({
  component: RootRedirect,
});

function RootRedirect() {
  const { data: user, isLoading, isFetching, isError } = useCurrentUser();
  const isMockAuth = env.VITE_MOCK_AUTH;
  const { currentRole } = useMockAuthStore();

  if (isMockAuth) {
    if (currentRole) {
      return <Navigate to={`/${currentRole}`} replace />;
    }
    return <Navigate to="/login" replace />;
  }

  if (isLoading || isFetching) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user && !isError) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  return <Navigate to="/login" replace />;
}
