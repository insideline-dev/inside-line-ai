import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useScoutControllerSubmit } from "@/api/generated/scout/scout";

export const Route = createFileRoute("/_protected/scout/submit")({
  component: ScoutSubmit,
});

const startupStages = [
  { value: "pre_seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c", label: "Series C" },
  { value: "series_d", label: "Series D" },
  { value: "series_e", label: "Series E" },
  { value: "series_f_plus", label: "Series F+" },
] as const;

const submitStartupSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  tagline: z.string().min(1, "Tagline is required").max(500),
  description: z.string().min(100, "Description must be at least 100 characters").max(5000),
  website: z.string().url("Must be a valid URL"),
  location: z.string().min(1, "Location is required").max(200),
  industry: z.string().min(1, "Industry is required").max(200),
  stage: z.enum([
    "pre_seed",
    "seed",
    "series_a",
    "series_b",
    "series_c",
    "series_d",
    "series_e",
    "series_f_plus",
  ]),
  fundingTarget: z.coerce.number().int().positive("Funding target must be positive"),
  teamSize: z.coerce.number().int().positive("Team size must be positive"),
  pitchDeckUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  demoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
});

type SubmitStartupForm = z.infer<typeof submitStartupSchema>;

function ScoutSubmit() {
  const form = useForm({
    resolver: zodResolver(submitStartupSchema) as any,
    defaultValues: {
      name: "",
      tagline: "",
      description: "",
      website: "",
      location: "",
      industry: "",
      stage: "pre_seed",
      fundingTarget: 0,
      teamSize: 1,
      pitchDeckUrl: "",
      demoUrl: "",
      notes: "",
    },
  });

  const { mutate, isPending } = useScoutControllerSubmit({
    mutation: {
      onSuccess: () => {
        toast.success("Startup submitted successfully");
        form.reset();
      },
      onError: (error) => {
        toast.error((error as Error).message || "Failed to submit startup");
      },
    },
  });

  const onSubmit = (values: SubmitStartupForm) => {
    // TODO: Get investorId from route params or user context when available
    const investorId = "00000000-0000-0000-0000-000000000001";

    mutate({
      data: {
        investorId,
        startupData: {
          name: values.name,
          tagline: values.tagline,
          description: values.description,
          website: values.website,
          location: values.location,
          industry: values.industry,
          stage: values.stage,
          fundingTarget: values.fundingTarget,
          teamSize: values.teamSize,
          pitchDeckUrl: values.pitchDeckUrl || undefined,
          demoUrl: values.demoUrl || undefined,
        },
        notes: values.notes || undefined,
      } as any, // Type mismatch due to outdated OpenAPI spec
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Submit Startup</h1>
        <p className="text-muted-foreground">Submit a promising startup for review</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Startup Submission</CardTitle>
          <CardDescription>
            Provide details about the startup you're recommending
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Startup Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Inc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tagline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tagline</FormLabel>
                    <FormControl>
                      <Input placeholder="A brief description of what they do" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Detailed description of the startup, their product, and market..."
                        className="min-h-32"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length}/5000 characters (min 100)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="San Francisco, CA" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Industry</FormLabel>
                      <FormControl>
                        <Input placeholder="FinTech, HealthTech, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="stage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stage</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select stage" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {startupStages.map((stage) => (
                            <SelectItem key={stage.value} value={stage.value}>
                              {stage.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="teamSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Size</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="fundingTarget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Funding Target ($)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1000" {...field} />
                    </FormControl>
                    <FormDescription>
                      Amount they're looking to raise
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pitchDeckUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pitch Deck URL (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="demoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Demo URL (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Additional context or why you think this is a great opportunity..."
                        className="min-h-24"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value?.length || 0}/500 characters
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Submitting..." : "Submit Startup"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
