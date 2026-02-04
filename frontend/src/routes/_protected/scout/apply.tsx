import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export const Route = createFileRoute("/_protected/scout/apply")({
  component: ScoutApplication,
});

function ScoutApplication() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    linkedinUrl: "",
    experience: "",
    motivation: "",
    dealflowSources: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast.success("Application submitted", {
      description: "We'll review your application and get back to you soon.",
    });

    setIsSubmitting(false);
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Become a Scout</h1>
        <p className="text-muted-foreground">Apply to join our network of startup scouts</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scout Application</CardTitle>
          <CardDescription>
            Tell us about yourself and why you'd be a great scout for Inside Line
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">LinkedIn Profile</Label>
              <Input
                id="linkedinUrl"
                type="url"
                placeholder="https://linkedin.com/in/..."
                value={formData.linkedinUrl}
                onChange={(e) => handleChange("linkedinUrl", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="experience">Relevant Experience</Label>
              <Textarea
                id="experience"
                placeholder="Describe your experience in the startup ecosystem, investment, or technology..."
                value={formData.experience}
                onChange={(e) => handleChange("experience", e.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="motivation">Why do you want to be a scout?</Label>
              <Textarea
                id="motivation"
                placeholder="Share your motivation for becoming a scout..."
                value={formData.motivation}
                onChange={(e) => handleChange("motivation", e.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dealflowSources">Deal Flow Sources</Label>
              <Textarea
                id="dealflowSources"
                placeholder="Describe how you'll source promising startups (networks, communities, events, etc.)"
                value={formData.dealflowSources}
                onChange={(e) => handleChange("dealflowSources", e.target.value)}
                rows={4}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Application"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
