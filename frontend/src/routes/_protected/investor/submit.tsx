import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Send, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/investor/submit")({
  component: InvestorSubmitPage,
});

function InvestorSubmitPage() {
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/investor" });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/investor">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Submit Private Startup</h1>
          <p className="text-muted-foreground">Add a startup to your private deal flow</p>
        </div>
      </div>

      <Alert>
        <Lock className="h-4 w-4" />
        <AlertDescription>
          This startup will only be visible to you and your team. It will not be shared with other investors.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Startup Information</CardTitle>
          <CardDescription>Enter the details of the startup you want to evaluate</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Startup Name *</Label>
              <Input id="name" placeholder="Enter startup name" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website *</Label>
              <Input id="website" type="url" placeholder="https://startup.com" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea id="description" placeholder="What does this startup do?" className="min-h-[100px]" required />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactName">Contact Name</Label>
                <Input id="contactName" placeholder="Founder name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input id="contactEmail" type="email" placeholder="founder@startup.com" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deck">Pitch Deck URL</Label>
              <Input id="deck" placeholder="https://drive.google.com/..." />
              <p className="text-xs text-muted-foreground">Link to the pitch deck</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Your Notes</Label>
              <Textarea id="notes" placeholder="Any notes about this deal..." className="min-h-[80px]" />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="gap-2">
                <Send className="h-4 w-4" />
                Submit for Analysis
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to="/investor">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
