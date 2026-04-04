import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { authApi, authKeys } from "@/lib/auth";
import { setAccessToken } from "@/lib/auth/token";
import { safeRedirect } from "@/lib/utils";
import insideLineLogo from "@/assets/icon-insideline.svg";

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
        const waitlistOnly = /waitlist/i.test(error);
        navigate({
          to: "/login",
          search: {
            error,
            view: waitlistOnly ? "waitlist" : undefined,
          },
          replace: true,
        });
        return;
      }

      if (success === "true") {
        // OAuth succeeded - refresh to get access token, then fetch user
        try {
          const refreshRes = await authApi.refresh();
          setAccessToken(refreshRes.accessToken);
          queryClient.setQueryData(authKeys.user, refreshRes.user);
          const user = refreshRes.user;
          if (user.onboardingCompleted) {
            const rawRedirect = sessionStorage.getItem("redirectAfterAuth");
            if (rawRedirect) sessionStorage.removeItem("redirectAfterAuth");
            navigate({ to: safeRedirect(rawRedirect, `/${user.role}`), replace: true });
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-2.5">
        <img src={insideLineLogo} alt="Inside Line" className="size-8 shrink-0" />
        <span className="font-serif text-2xl font-normal tracking-tight">Inside Line</span>
      </div>
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}
