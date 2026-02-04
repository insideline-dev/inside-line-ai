import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Building2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/apply/$slug")({
  component: PublicApplyPage,
});

function PublicApplyPage() {
  const { slug: _slug } = Route.useParams();

  // Mock portal data - would be fetched based on slug
  const portal = {
    fundName: "Venture Capital Partners",
    tagline: "Backing bold founders building the future",
    welcomeMessage: "Submit your startup for consideration by our investment team.",
    accentColor: "#6366f1",
  };

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
          <h1 className="text-3xl font-bold mb-2">{portal.fundName}</h1>
          <p className="text-lg text-muted-foreground mb-4">{portal.tagline}</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">{portal.welcomeMessage}</p>
        </div>
      </div>

      {/* Form */}
      <div className="container mx-auto max-w-2xl py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Submit Your Startup</CardTitle>
            <CardDescription>Fill out the form below to submit your startup for evaluation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Startup Name *</Label>
                <Input id="name" placeholder="Enter your startup name" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="website">Website *</Label>
                <Input id="website" placeholder="https://yourstartup.com" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea id="description" placeholder="Describe what your startup does..." className="min-h-[100px]" />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="stage">Funding Stage *</Label>
                  <Input id="stage" placeholder="e.g., Seed, Series A" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="location">Location *</Label>
                  <Input id="location" placeholder="e.g., San Francisco, CA" />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="contact">Contact Email *</Label>
                <Input id="contact" type="email" placeholder="founder@startup.com" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="deck">Pitch Deck URL</Label>
                <Input id="deck" placeholder="https://drive.google.com/..." />
                <p className="text-xs text-muted-foreground">Link to your pitch deck (Google Drive, Dropbox, etc.)</p>
              </div>
            </div>

            <Button className="w-full gap-2">
              Submit for Review
              <ArrowRight className="w-4 h-4" />
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              By submitting, you agree to our terms of service and privacy policy.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
