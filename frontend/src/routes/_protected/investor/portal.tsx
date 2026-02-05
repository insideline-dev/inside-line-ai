import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Copy, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePortalControllerFindAll,
  usePortalControllerCreate,
  usePortalControllerUpdate,
  getPortalControllerFindAllQueryKey,
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

function InvestorPortalPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: response, isLoading } = usePortalControllerFindAll();
  const portals = (response?.data as Array<{ id: number; name: string; slug: string; description?: string; brandColor?: string; isActive?: boolean }> | undefined) ?? [];
  const existingPortal = portals[0]; // Investor typically has one portal

  const [formData, setFormData] = useState<PortalFormData>({
    name: "Venture Capital Partners",
    slug: "venture-capital-partners",
    description: "Submit your startup for consideration by our investment team. We review all submissions and respond within 2 weeks.",
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
    }
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

  const handleSave = () => {
    if (existingPortal) {
      updatePortal({ id: existingPortal.id.toString(), data: formData });
    } else {
      createPortal({ data: formData });
    }
  };

  const portalUrl = `${window.location.origin}/apply/${formData.slug}`;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Submission Portal</h1>
            <p className="text-muted-foreground">Configure your public startup submission portal</p>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Submission Portal</h1>
          <p className="text-muted-foreground">Configure your public startup submission portal</p>
        </div>
        <Button className="gap-2" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Portal Settings</CardTitle>
            <CardDescription>Configure your public-facing portal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Portal</Label>
                <p className="text-sm text-muted-foreground">Allow startups to submit via your portal</p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Portal Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Your Fund Name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Portal URL Slug</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="your-fund-name"
              />
              <p className="text-xs text-muted-foreground">Letters, numbers, and hyphens only</p>
            </div>

            <div className="space-y-2">
              <Label>Portal URL</Label>
              <div className="flex gap-2">
                <Input value={portalUrl} readOnly className="bg-muted" />
                <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(portalUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
            <CardDescription>Customize how your portal looks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="color">Brand Color</Label>
              <div className="flex gap-2">
                <Input
                  id="color"
                  type="color"
                  value={formData.brandColor}
                  onChange={(e) => setFormData((prev) => ({ ...prev, brandColor: e.target.value }))}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={formData.brandColor}
                  onChange={(e) => setFormData((prev) => ({ ...prev, brandColor: e.target.value }))}
                  className="flex-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Description</CardTitle>
            <CardDescription>The description founders see when visiting your portal</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Submit your startup for consideration..."
              className="min-h-[100px]"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
