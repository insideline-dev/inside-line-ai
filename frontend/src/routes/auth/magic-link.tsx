import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { useVerifyMagicLink } from "@/lib/auth";

const searchSchema = z.object({
  token: z.string(),
});

export const Route = createFileRoute("/auth/magic-link")({
  validateSearch: searchSchema,
  component: MagicLinkPage,
});

function MagicLinkPage() {
  const navigate = useNavigate();
  const verifyMutation = useVerifyMagicLink();
  const { token } = Route.useSearch();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;
    verifyMutation.mutate(token, {
      onError: (err) => {
        navigate({
          to: "/login",
          search: { error: err.message || "Invalid or expired magic link" },
          replace: true,
        });
      },
    });
  }, [navigate, token, verifyMutation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}
