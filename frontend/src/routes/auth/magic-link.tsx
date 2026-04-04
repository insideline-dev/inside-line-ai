import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { useVerifyMagicLink } from "@/lib/auth";
import insideLineLogo from "@/assets/icon-insideline.svg";

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
