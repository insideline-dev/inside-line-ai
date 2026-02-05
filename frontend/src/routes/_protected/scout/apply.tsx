import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useScoutControllerApply } from "@/api/generated/scout/scout";

export const Route = createFileRoute("/_protected/scout/apply")({
  component: ScoutApplication,
});

const applyScoutSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(200),
  email: z.string().email("Invalid email address"),
  linkedinUrl: z.string().url("Must be a valid URL"),
  experience: z.string().min(100, "Experience must be at least 100 characters").max(1000),
  motivation: z.string().min(100, "Motivation must be at least 100 characters").max(1000),
  dealflowSources: z.string().min(50, "Dealflow sources must be at least 50 characters").max(500),
  portfolio: z.string().optional(),
});

type ApplyScoutForm = z.infer<typeof applyScoutSchema>;

function ScoutApplication() {
  const form = useForm({
    resolver: zodResolver(applyScoutSchema) as any,
    defaultValues: {
      name: "",
      email: "",
      linkedinUrl: "",
      experience: "",
      motivation: "",
      dealflowSources: "",
      portfolio: "",
    },
  });

  const { mutate, isPending } = useScoutControllerApply({
    mutation: {
      onSuccess: () => {
        toast.success("Application submitted successfully");
        form.reset();
      },
      onError: (error) => {
        toast.error((error as Error).message || "Failed to submit application");
      },
    },
  });

  const onSubmit = (values: ApplyScoutForm) => {
    // TODO: Get investorId from route params or user context when available
    const investorId = "00000000-0000-0000-0000-000000000001";

    const portfolio = values.portfolio
      ? values.portfolio.split("\n").map((url) => url.trim()).filter(Boolean)
      : [];

    mutate({
      data: {
        investorId,
        name: values.name,
        email: values.email,
        linkedinUrl: values.linkedinUrl,
        experience: values.experience,
        motivation: values.motivation,
        dealflowSources: values.dealflowSources,
        portfolio,
      } as any, // Type mismatch due to outdated OpenAPI spec
    });
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
            Tell us about your background and why you'd be a great scout
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="linkedinUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://linkedin.com/in/..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="experience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Experience</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your relevant experience in the startup ecosystem..."
                        className="min-h-32"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length}/1000 characters (min 100)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="motivation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivation</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Why do you want to become a scout?"
                        className="min-h-32"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length}/1000 characters (min 100)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dealflowSources"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dealflow Sources</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Where do you discover promising startups?"
                        className="min-h-24"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value.length}/500 characters (min 50)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="portfolio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Portfolio (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="List URLs of startups you've worked with (one per line)"
                        className="min-h-24"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      One URL per line, max 10
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Submitting..." : "Submit Application"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
