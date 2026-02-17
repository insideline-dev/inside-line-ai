import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { StartupSubmitForm } from "@/components/startup/StartupSubmitForm";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePortalControllerGetPortalBySlug } from "@/api/generated/portal/portal";

export const Route = createFileRoute("/apply/$slug")({
  component: PublicApplyPage,
});

function extractResponseData<T>(payload: unknown): T | null {
  if (payload === null || payload === undefined) return null;
  if (
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

type PortalView = {
  name: string;
  description?: string;
  tagline?: string;
  welcomeMessage?: string;
  isActive: boolean;
  requiredFields?: string[];
};

function PublicApplyPage() {
  const { slug } = Route.useParams();
  const { data: response, isLoading } = usePortalControllerGetPortalBySlug(slug);
  const portal = extractResponseData<PortalView>(response);
  const [submitted, setSubmitted] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!portal || !portal.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Portal Not Found</h1>
          <p className="text-muted-foreground">
            This application portal doesn't exist or is no longer active.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Submission Received!</h1>
          <p className="text-muted-foreground">
            Thank you for submitting your startup. We&apos;ll review it and get back to you soon.
          </p>
        </div>
      </div>
    );
  }

  const subtitle = portal.tagline ?? "";
  const message = portal.welcomeMessage ?? portal.description ?? "";

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-5xl font-bold tracking-tight">{portal.name}</h1>
            {subtitle && <p className="text-xl text-muted-foreground">{subtitle}</p>}
            {message && <p className="text-xl text-muted-foreground">{message}</p>}
          </div>

          <StartupSubmitForm
            userRole="portal"
            portalSlug={slug}
            portalRequiredFields={portal.requiredFields ?? []}
            onSuccess={() => setSubmitted(true)}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
