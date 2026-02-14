import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Building2, ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  usePortalControllerGetPortalBySlug,
  usePortalControllerSubmitToPortal,
} from "@/api/generated/portal/portal";
import { SubmitToPortalDto, SubmitToPortalDtoStage } from "@/api/generated/model";

export const Route = createFileRoute("/apply/$slug")({
  component: PublicApplyPage,
});

function PublicApplyPage() {
  const { slug } = Route.useParams();
  const { data: response, isLoading } = usePortalControllerGetPortalBySlug(slug);
  const portal = response?.data as { name: string; tagline: string; welcomeMessage?: string; brandColor?: string; isActive: boolean } | undefined;

  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<Partial<SubmitToPortalDto>>({});

  const { mutate: submitStartup, isPending } = usePortalControllerSubmitToPortal({
    mutation: {
      onSuccess: () => {
        toast.success("Startup submitted successfully!");
        setSubmitted(true);
      },
      onError: (err) => toast.error((err as Error).message || "Failed to submit"),
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.tagline || !formData.description || !formData.website ||
        !formData.location || !formData.industry || !formData.stage || !formData.fundingTarget || !formData.teamSize) {
      toast.error("Please fill all required fields");
      return;
    }
    submitStartup({ slug, data: formData as SubmitToPortalDto });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLoading && (!portal || !portal.isActive)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Portal Not Found</h1>
          <p className="text-muted-foreground">This application portal doesn't exist or is no longer active.</p>
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
          <p className="text-muted-foreground">Thank you for submitting your startup. We'll review it and get back to you soon.</p>
        </div>
      </div>
    );
  }

  if (!portal) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto max-w-4xl flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-semibold">Inside Line</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="border-b bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto max-w-4xl py-12 px-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">{portal.name}</h1>
          <p className="text-lg text-muted-foreground mb-4">{portal.tagline}</p>
          {portal.welcomeMessage && (
            <p className="text-sm text-muted-foreground max-w-md mx-auto">{portal.welcomeMessage}</p>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="container mx-auto max-w-2xl py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Submit Your Startup</CardTitle>
            <CardDescription>Fill out the form below to submit your startup for evaluation</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Startup Name *</Label>
                  <Input
                    id="name"
                    placeholder="Enter your startup name"
                    maxLength={200}
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="tagline">Tagline *</Label>
                  <Input
                    id="tagline"
                    placeholder="A short tagline for your startup"
                    maxLength={500}
                    value={formData.tagline || ""}
                    onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="website">Website *</Label>
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://yourstartup.com"
                    value={formData.website || ""}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what your startup does (minimum 100 characters)..."
                    className="min-h-[100px]"
                    minLength={100}
                    maxLength={5000}
                    value={formData.description || ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{formData.description?.length || 0} / 5000 characters</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="industry">Industry *</Label>
                    <Input
                      id="industry"
                      placeholder="e.g., FinTech, HealthTech"
                      maxLength={200}
                      value={formData.industry || ""}
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="location">City / Location *</Label>
                    <Input
                      id="location"
                      placeholder="e.g., Cairo, Egypt"
                      maxLength={200}
                      value={formData.location || ""}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      We map this automatically to investor geography levels.
                    </p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="stage">Funding Stage *</Label>
                    <Select
                      value={formData.stage}
                      onValueChange={(value: SubmitToPortalDtoStage) => setFormData({ ...formData, stage: value })}
                    >
                      <SelectTrigger id="stage">
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SubmitToPortalDtoStage.pre_seed}>Pre-Seed</SelectItem>
                        <SelectItem value={SubmitToPortalDtoStage.seed}>Seed</SelectItem>
                        <SelectItem value={SubmitToPortalDtoStage.series_a}>Series A</SelectItem>
                        <SelectItem value={SubmitToPortalDtoStage.series_b}>Series B</SelectItem>
                        <SelectItem value={SubmitToPortalDtoStage.series_c}>Series C</SelectItem>
                        <SelectItem value={SubmitToPortalDtoStage.series_d}>Series D</SelectItem>
                        <SelectItem value={SubmitToPortalDtoStage.series_e}>Series E</SelectItem>
                        <SelectItem value={SubmitToPortalDtoStage.series_f_plus}>Series F+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="teamSize">Team Size *</Label>
                    <Input
                      id="teamSize"
                      type="number"
                      min={1}
                      placeholder="e.g., 5"
                      value={formData.teamSize || ""}
                      onChange={(e) => setFormData({ ...formData, teamSize: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="fundingTarget">Funding Target (USD) *</Label>
                  <Input
                    id="fundingTarget"
                    type="number"
                    min={1}
                    placeholder="e.g., 1000000"
                    value={formData.fundingTarget || ""}
                    onChange={(e) => setFormData({ ...formData, fundingTarget: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="founderName">Founder Name</Label>
                    <Input
                      id="founderName"
                      placeholder="Your name"
                      maxLength={200}
                      value={formData.founderName || ""}
                      onChange={(e) => setFormData({ ...formData, founderName: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="founderEmail">Founder Email</Label>
                    <Input
                      id="founderEmail"
                      type="email"
                      placeholder="founder@startup.com"
                      value={formData.founderEmail || ""}
                      onChange={(e) => setFormData({ ...formData, founderEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="pitchDeckUrl">Pitch Deck URL</Label>
                  <Input
                    id="pitchDeckUrl"
                    type="url"
                    placeholder="https://drive.google.com/..."
                    value={formData.pitchDeckUrl || ""}
                    onChange={(e) => setFormData({ ...formData, pitchDeckUrl: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Link to your pitch deck (Google Drive, Dropbox, etc.)</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="demoUrl">Demo URL</Label>
                  <Input
                    id="demoUrl"
                    type="url"
                    placeholder="https://demo.yourstartup.com"
                    value={formData.demoUrl || ""}
                    onChange={(e) => setFormData({ ...formData, demoUrl: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Link to your product demo or video</p>
                </div>
              </div>

              <Button type="submit" className="w-full gap-2" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit for Review
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By submitting, you agree to our terms of service and privacy policy.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
