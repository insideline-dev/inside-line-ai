import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { authApi, authKeys } from "@/lib/auth";

const searchSchema = z.object({
  success: z.coerce.string().optional(),
  error: z.coerce.string().optional(),
});

export const Route = createFileRoute("/auth/callback")({
  validateSearch: searchSchema,
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error } = Route.useSearch();

  useEffect(() => {
    async function handleCallback() {
      if (error) {
        // OAuth failed
        navigate({ to: "/login", search: { error }, replace: true });
        return;
      }

      if (success === "true") {
        // OAuth succeeded - fetch user and redirect
        try {
          const user = await authApi.getCurrentUser();
          queryClient.setQueryData(authKeys.user, user);
          if (user.onboardingCompleted) {
            const redirect = sessionStorage.getItem("redirectAfterAuth");
            if (redirect) sessionStorage.removeItem("redirectAfterAuth");
            navigate({ to: redirect || `/${user.role}`, replace: true });
          } else {
            navigate({ to: "/role-select", replace: true });
          }
        } catch {
          navigate({ to: "/login", replace: true });
        }
        return;
      }

      // No params - go to login
      navigate({ to: "/login", replace: true });
    }

    handleCallback();
  }, [success, error, navigate, queryClient]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}
