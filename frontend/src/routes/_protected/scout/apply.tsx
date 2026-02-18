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
import {
  getScoutControllerGetMyApplicationsQueryKey,
  useScoutControllerApply,
  useScoutControllerGetInvestors,
} from "@/api/generated/scout/scout";
import { useQueryClient } from "@tanstack/react-query";
import type { ScoutInvestorsResponseDtoDataItem } from "@/api/generated/model";

export const Route = createFileRoute("/_protected/scout/apply")({
  component: ScoutApplication,
});

const applyScoutSchema = z.object({
  investorId: z.string().uuid("Investor is required"),
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
  const queryClient = useQueryClient();
  const form = useForm<ApplyScoutForm>({
    resolver: zodResolver(applyScoutSchema),
    defaultValues: {
      investorId: "",
      name: "",
      email: "",
      linkedinUrl: "",
      experience: "",
      motivation: "",
      dealflowSources: "",
      portfolio: "",
    },
  });

  const { data: investorsResponse, isLoading: loadingInvestors } = useScoutControllerGetInvestors();
  const investors = (investorsResponse?.data.data ?? []) as ScoutInvestorsResponseDtoDataItem[];

  const availableInvestors = investors.filter(
    (investor) => investor.applicationStatus === null,
  );

  const { mutate, isPending } = useScoutControllerApply({
    mutation: {
      onSuccess: async () => {
        toast.success("Application submitted successfully");
        await queryClient.invalidateQueries({
          queryKey: getScoutControllerGetMyApplicationsQueryKey(),
        });
        form.reset({
          ...form.getValues(),
          investorId: "",
          experience: "",
          motivation: "",
          dealflowSources: "",
          portfolio: "",
        });
      },
      onError: (error) => {
        toast.error((error as Error).message || "Failed to submit application");
      },
    },
  });

  const onSubmit = (values: ApplyScoutForm) => {
    const portfolio = values.portfolio
      ? values.portfolio.split("\n").map((url) => url.trim()).filter(Boolean)
      : [];

    mutate({
      data: {
        investorId: values.investorId,
        name: values.name,
        email: values.email,
        linkedinUrl: values.linkedinUrl,
        experience: values.experience,
        motivation: values.motivation,
        dealflowSources: values.dealflowSources,
        portfolio,
      },
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
                name="investorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Investor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={loadingInvestors}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingInvestors ? "Loading investors..." : "Select investor"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableInvestors.map((investor) => (
                          <SelectItem key={investor.id} value={investor.id}>
                            {investor.name} ({investor.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {availableInvestors.length > 0
                        ? "Choose the investor you want to scout for."
                        : "No open investor applications are available for your account."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

              <Button type="submit" disabled={isPending || !availableInvestors.length} className="w-full">
                {isPending ? "Submitting..." : "Submit Application"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
