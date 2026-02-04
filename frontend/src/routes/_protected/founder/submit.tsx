import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_protected/founder/submit")({
  component: SubmitStartup,
});

const steps = [
  { id: 1, name: "Company Basics" },
  { id: 2, name: "Industry & Stage" },
  { id: 3, name: "Team" },
  { id: 4, name: "Deal Terms" },
  { id: 5, name: "Documents" },
];

function SubmitStartup() {
  const currentStep = 1;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/founder">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Submit New Startup</h1>
        <p className="text-muted-foreground">Complete the form to submit your startup for analysis</p>
      </div>

      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={cn(
                  "w-10 h-10 rounded-full border-2 flex items-center justify-center font-semibold transition-colors",
                  currentStep === step.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : currentStep > step.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/20 text-muted-foreground"
                )}
              >
                {step.id}
              </div>
              <span
                className={cn(
                  "text-xs mt-2 font-medium",
                  currentStep >= step.id ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.name}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 transition-colors -mt-8",
                  currentStep > step.id ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Basics</CardTitle>
          <CardDescription>Tell us about your company</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Company Name <span className="text-destructive">*</span>
              </Label>
              <Input id="name" placeholder="Enter your company name" required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" type="url" placeholder="https://example.com" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Provide a brief description of your company and what it does"
                rows={4}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="location">
                Location <span className="text-destructive">*</span>
              </Label>
              <Input id="location" placeholder="City, State/Country" required />
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" disabled>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
            <Button>
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
