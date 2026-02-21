import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SlidersHorizontal,
  MessageSquareText,
  Palette,
  Save,
  Loader2,
  Link2,
  Copy,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getPortalControllerFindAllQueryKey,
  usePortalControllerCreate,
  usePortalControllerFindAll,
  usePortalControllerUpdate,
} from "@/api/generated/portal/portal";

export const Route = createFileRoute("/_protected/investor/portal")({
  component: InvestorPortalPage,
});

interface PortalFormData {
  name: string;
  slug: string;
  description: string;
  brandColor: string;
  isActive: boolean;
}

type PortalRecord = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  brandColor?: string;
  isActive?: boolean;
};

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function InvestorPortalPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: response, isLoading } = usePortalControllerFindAll();
  const portals = (response?.data as PortalRecord[] | undefined) ?? [];
  const existingPortal = portals[0];

  const [formData, setFormData] = useState<PortalFormData>({
    name: "",
    slug: "",
    description: "",
    brandColor: "#6366f1",
    isActive: true,
  });

  useEffect(() => {
    if (existingPortal) {
      setFormData({
        name: existingPortal.name ?? "",
        slug: existingPortal.slug ?? "",
        description: existingPortal.description ?? "",
        brandColor: existingPortal.brandColor ?? "#6366f1",
        isActive: existingPortal.isActive ?? true,
      });
      return;
    }

    setFormData({
      name: "your fund name",
      slug: "your-fund-name",
      description: "",
      brandColor: "#6366f1",
      isActive: false,
    });
  }, [existingPortal]);

  const { mutate: createPortal, isPending: isCreating } = usePortalControllerCreate({
    mutation: {
      onSuccess: () => {
        toast.success("Portal created successfully");
        queryClient.invalidateQueries({ queryKey: getPortalControllerFindAllQueryKey() });
      },
      onError: (error) => {
        toast.error("Failed to create portal", { description: (error as Error).message });
      },
    },
  });

  const { mutate: updatePortal, isPending: isUpdating } = usePortalControllerUpdate({
    mutation: {
      onSuccess: () => {
        toast.success("Portal updated successfully");
        queryClient.invalidateQueries({ queryKey: getPortalControllerFindAllQueryKey() });
      },
      onError: (error) => {
        toast.error("Failed to update portal", { description: (error as Error).message });
      },
    },
  });

  const isSaving = isCreating || isUpdating;
  const portalBaseUrl = useMemo(() => {
    if (typeof window === "undefined") return "/apply/";
    try {
      const currentUrl = new URL(window.location.origin);
      const hostname = currentUrl.hostname.startsWith("app.")
        ? currentUrl.hostname.slice(4)
        : currentUrl.hostname;
      const normalizedOrigin = `${currentUrl.protocol}//${hostname}${
        currentUrl.port ? `:${currentUrl.port}` : ""
      }`;
      return `${normalizedOrigin}/apply/`;
    } catch {
      return `${window.location.origin}/apply/`;
    }
  }, []);
  const portalPublicUrl = useMemo(
    () => `${portalBaseUrl}${sanitizeSlug(formData.slug)}`,
    [portalBaseUrl, formData.slug],
  );

  const handleSave = () => {
    const payload = {
      ...formData,
      slug: sanitizeSlug(formData.slug),
      name: formData.name.trim() || "submission portal",
      description: formData.description.trim() || "Tell us about your company and why you're building it.",
    };

    if (existingPortal) {
      updatePortal({ id: existingPortal.id, data: payload });
    } else {
      createPortal({ data: payload });
    }
  };

  const handleCopyPortalUrl = async () => {
    try {
      await navigator.clipboard.writeText(portalPublicUrl);
      toast.success("Portal link copied");
    } catch {
      toast.error("Failed to copy portal link");
    }
  };

  const handleOpenPortalUrl = () => {
    if (typeof window === "undefined") return;
    window.open(portalPublicUrl, "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Startup Submission Portal</h1>
        <p className="text-muted-foreground">
          Create a branded page where startups can submit their companies directly to you.
        </p>
      </div>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Link2 className="h-6 w-6" />
            Your Portal Link
          </CardTitle>
          <CardDescription>
            Share this link with startups you want to receive submissions from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={portalPublicUrl} readOnly className="sm:flex-1 bg-muted" />
            <Button variant="outline" size="icon" onClick={handleCopyPortalUrl} aria-label="Copy portal link">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleOpenPortalUrl} aria-label="Open portal link">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <SlidersHorizontal className="h-7 w-7" />
            Portal Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-5">
            <div>
              <p className="text-base font-medium">Enable Portal</p>
              <p className="text-muted-foreground">
                When enabled, startups can submit their companies through your portal link.
              </p>
            </div>
            <Switch
              checked={formData.isActive}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  isActive: checked,
                }))
              }
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="portal-slug" className="text-base font-medium">
              Portal URL
            </Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input value={portalBaseUrl} readOnly className="md:w-[45%] bg-muted" />
              <Input
                id="portal-slug"
                value={formData.slug}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    slug: sanitizeSlug(event.target.value),
                  }))
                }
                placeholder="your-fund-name"
                className="md:flex-1"
              />
            </div>
            <p className="text-muted-foreground">
              This is the unique URL for your submission portal. Use lowercase letters, numbers, and hyphens only.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MessageSquareText className="h-7 w-7" />
            Branding & Messaging
          </CardTitle>
          <CardDescription>Customize how your portal looks to startups.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-7">
          <div className="space-y-2">
            <Label htmlFor="portal-name" className="text-base font-medium">
              Tagline
            </Label>
            <Input
              id="portal-name"
              value={formData.name}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
              placeholder="e.g., Backing ambitious founders building the future"
            />
            <p className="text-muted-foreground">A short tagline that appears under your fund name.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="portal-description" className="text-base font-medium">
              Welcome Message
            </Label>
            <Textarea
              id="portal-description"
              value={formData.description}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              placeholder="e.g., We're excited to hear from you! Tell us about your company and why you're building it."
              className="min-h-[180px]"
              maxLength={1000}
            />
            <p className="text-muted-foreground">
              A welcome message displayed to startups when they visit your portal.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="portal-color" className="flex items-center gap-2 text-base font-medium">
              <Palette className="h-4 w-4" />
              Accent Color
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="portal-color"
                type="color"
                value={formData.brandColor}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    brandColor: event.target.value,
                  }))
                }
                className="h-12 w-16 p-1"
              />
              <Input
                value={formData.brandColor}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    brandColor: event.target.value,
                  }))
                }
                placeholder="#6366f1"
                className="sm:w-44"
              />
              <p className="text-muted-foreground">Used for the submit button</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
