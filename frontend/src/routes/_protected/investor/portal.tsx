import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ExternalLink, Copy, Save } from "lucide-react";

export const Route = createFileRoute("/_protected/investor/portal")({
  component: InvestorPortalPage,
});

function InvestorPortalPage() {
  const slug = "venture-capital-partners";
  const portalUrl = `${window.location.origin}/apply/${slug}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Submission Portal</h1>
          <p className="text-muted-foreground">Configure your public startup submission portal</p>
        </div>
        <Button className="gap-2">
          <Save className="h-4 w-4" />
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
              <Switch defaultChecked />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Portal URL Slug</Label>
              <Input id="slug" defaultValue={slug} placeholder="your-fund-name" />
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
              <Label htmlFor="tagline">Tagline</Label>
              <Input id="tagline" defaultValue="Backing bold founders building the future" placeholder="Your fund tagline" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="color">Accent Color</Label>
              <div className="flex gap-2">
                <Input id="color" type="color" defaultValue="#6366f1" className="w-16 h-10 p-1" />
                <Input defaultValue="#6366f1" className="flex-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Welcome Message</CardTitle>
            <CardDescription>The message founders see when visiting your portal</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Welcome to our submission portal..."
              className="min-h-[100px]"
              defaultValue="Submit your startup for consideration by our investment team. We review all submissions and respond within 2 weeks."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
