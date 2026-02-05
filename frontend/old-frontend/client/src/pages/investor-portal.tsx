import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, CheckCircle, Copy, ExternalLink, Link2, Palette, MessageSquare, Settings2 } from "lucide-react";
import type { InvestorPortalSettings } from "@shared/schema";

interface AuthUser {
  id: string;
  role?: "founder" | "investor" | "admin" | null;
}

const portalSettingsSchema = z.object({
  slug: z.string()
    .min(3, "URL must be at least 3 characters")
    .max(50, "URL must be less than 50 characters")
    .regex(/^[a-z0-9-]+$/, "URL can only contain lowercase letters, numbers, and hyphens"),
  welcomeMessage: z.string().optional(),
  tagline: z.string().optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
  isEnabled: z.boolean(),
});

type PortalSettingsFormData = z.infer<typeof portalSettingsSchema>;

export default function InvestorPortal() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: user, isLoading: isAuthLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: portalSettings, isLoading: isSettingsLoading } = useQuery<InvestorPortalSettings | null>({
    queryKey: ["/api/investor/portal"],
    enabled: !!user,
  });

  const { data: investorProfile } = useQuery<{ fundName: string } | null>({
    queryKey: ["/api/investor/thesis"],
    enabled: !!user,
    select: (data: any) => data ? { fundName: data.profile?.fundName } : null,
  });

  const form = useForm<PortalSettingsFormData>({
    resolver: zodResolver(portalSettingsSchema),
    defaultValues: {
      slug: "",
      welcomeMessage: "",
      tagline: "",
      accentColor: "#6366f1",
      isEnabled: false,
    },
  });

  useEffect(() => {
    if (portalSettings) {
      form.reset({
        slug: portalSettings.slug,
        welcomeMessage: portalSettings.welcomeMessage || "",
        tagline: portalSettings.tagline || "",
        accentColor: portalSettings.accentColor || "#6366f1",
        isEnabled: portalSettings.isEnabled,
      });
    } else if (investorProfile?.fundName && !portalSettings) {
      const suggestedSlug = investorProfile.fundName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      form.setValue("slug", suggestedSlug);
    }
  }, [portalSettings, investorProfile, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: PortalSettingsFormData) => {
      const response = await apiRequest("POST", "/api/investor/portal", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investor/portal"] });
      toast({
        title: "Settings Saved",
        description: "Your portal settings have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PortalSettingsFormData) => {
    saveMutation.mutate(data);
  };

  const copyPortalLink = () => {
    const slug = form.watch("slug");
    const link = `${window.location.origin}/apply/${slug}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Link Copied",
      description: "Portal link copied to clipboard",
    });
  };

  const openPortalPreview = () => {
    const slug = form.watch("slug");
    window.open(`/apply/${slug}`, "_blank");
  };

  useEffect(() => {
    if (!isAuthLoading && !user) {
      window.location.href = "/api/login/investor";
    }
  }, [user, isAuthLoading]);

  if (isAuthLoading || isSettingsLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentSlug = form.watch("slug");
  const portalLink = currentSlug ? `${window.location.origin}/apply/${currentSlug}` : "";
  const isEnabled = form.watch("isEnabled");

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Startup Submission Portal</h1>
        <p className="text-muted-foreground">
          Create a branded page where startups can submit their companies directly to you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Your Portal Link
          </CardTitle>
          <CardDescription>
            Share this link with startups you want to receive submissions from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input 
              value={portalLink} 
              readOnly 
              className="flex-1 bg-muted"
              data-testid="input-portal-link"
            />
            <Button 
              variant="outline" 
              size="icon" 
              onClick={copyPortalLink}
              disabled={!currentSlug}
              data-testid="button-copy-link"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={openPortalPreview}
              disabled={!currentSlug || !portalSettings?.isEnabled}
              data-testid="button-preview"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
          {!isEnabled && currentSlug && (
            <p className="text-sm text-amber-600 mt-2">
              Your portal is currently disabled. Enable it below to start accepting submissions.
            </p>
          )}
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="w-5 h-5" />
                Portal Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="isEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Portal</FormLabel>
                      <FormDescription>
                        When enabled, startups can submit their companies through your portal link.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-enable-portal"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Portal URL</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0">
                          {window.location.origin}/apply/
                        </span>
                        <Input 
                          placeholder="your-fund-name" 
                          className="rounded-l-none"
                          {...field} 
                          onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                          data-testid="input-slug"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      This is the unique URL for your submission portal. Use lowercase letters, numbers, and hyphens only.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Branding & Messaging
              </CardTitle>
              <CardDescription>
                Customize how your portal looks to startups.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="tagline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tagline</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Backing ambitious founders building the future"
                        {...field} 
                        data-testid="input-tagline"
                      />
                    </FormControl>
                    <FormDescription>
                      A short tagline that appears under your fund name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="welcomeMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Welcome Message</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="e.g., We're excited to hear from you! Tell us about your company and why you're building it."
                        className="min-h-[100px]"
                        {...field} 
                        data-testid="input-welcome-message"
                      />
                    </FormControl>
                    <FormDescription>
                      A welcome message displayed to startups when they visit your portal.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accentColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      Accent Color
                    </FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-3">
                        <Input 
                          type="color" 
                          className="w-12 h-10 p-1 cursor-pointer"
                          {...field}
                          data-testid="input-accent-color"
                        />
                        <Input 
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="#6366f1"
                          className="w-28"
                          data-testid="input-accent-color-hex"
                        />
                        <span className="text-sm text-muted-foreground">
                          Used for the submit button
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={saveMutation.isPending}
              data-testid="button-save-settings"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
