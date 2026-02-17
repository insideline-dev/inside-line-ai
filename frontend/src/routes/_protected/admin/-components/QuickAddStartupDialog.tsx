import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAdminControllerQuickCreateStartup } from "@/api/generated/admin/admin";
import { QUICK_ADD_PRESETS } from "./quick-add-presets";

const stages = [
  { value: "pre_seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c", label: "Series C" },
] as const;

const formSchema = z.object({
  name: z.string().min(1, "Required").max(200),
  tagline: z.string().min(1, "Required").max(500),
  description: z.string().min(10, "Min 10 characters").max(5000),
  website: z.string().url("Must be a valid URL"),
  location: z.string().min(1, "Required").max(200),
  industry: z.string().min(1, "Required").max(200),
  stage: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c", "series_d", "series_e", "series_f_plus"]),
  fundingTarget: z.coerce.number().int().nonnegative(),
  teamSize: z.coerce.number().int().positive(),
  pitchDeckUrl: z.string().url().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

export function QuickAddStartupDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: "",
      tagline: "",
      description: "",
      website: "",
      location: "",
      industry: "",
      stage: "seed",
      fundingTarget: 0,
      teamSize: 1,
      pitchDeckUrl: "",
    },
  });

  const mutation = useAdminControllerQuickCreateStartup();

  const applyPreset = (presetId: string) => {
    const preset = QUICK_ADD_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const { teamMembers: _, ...formData } = preset.data;
    form.reset({ ...formData, pitchDeckUrl: formData.pitchDeckUrl ?? "" });
  };

  const onSubmit = (values: FormValues) => {
    const preset = QUICK_ADD_PRESETS.find((p) => p.data.name === values.name);
    const teamMembers = preset?.data.teamMembers;

    mutation.mutate(
      {
        data: {
          ...values,
          pitchDeckUrl: values.pitchDeckUrl || undefined,
          teamMembers,
        },
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSuccess: (response: any) => {
          const data = response?.data ?? response;
          if (data?.isDuplicate) {
            toast.warning("Duplicate detected", {
              description: (
                <span>
                  {data.startupName} already exists.{" "}
                  <Link to="/admin/startup/$id" params={{ id: data.startupId }} className="underline font-medium">
                    View startup
                  </Link>
                </span>
              ),
            });
            return;
          }
          toast.success("Startup created", {
            description: `${data.startupName} is now being analyzed.`,
          });
          queryClient.invalidateQueries({ queryKey: ["/admin/startups"] });
          queryClient.invalidateQueries({ queryKey: ["/admin/stats"] });
          setOpen(false);
          form.reset();
          if (data?.startupId) {
            navigate({
              to: "/admin/startup/$id",
              params: { id: data.startupId },
            });
          }
        },
        onError: () => {
          toast.error("Failed to create startup");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Zap className="w-4 h-4 mr-2" />
          Quick Add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Add Startup</DialogTitle>
        </DialogHeader>

        {/* Presets */}
        <div className="flex gap-2 pb-2">
          {QUICK_ADD_PRESETS.map((preset) => (
            <Button key={preset.id} variant="outline" size="sm" onClick={() => applyPreset(preset.id)}>
              {preset.emoji} {preset.label}
            </Button>
          ))}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Startup name" />
                    </FormControl>
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
                      <Input {...field} placeholder="https://example.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tagline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tagline</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="One-line pitch" />
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
                    <Textarea {...field} placeholder="Brief company description" rows={3} />
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
                      <Input {...field} placeholder="City, Country" />
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
                      <Input {...field} placeholder="e.g. Fintech" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stage</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stages.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
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
                name="fundingTarget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Funding Target ($)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" />
                    </FormControl>
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
                      <Input {...field} type="number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="pitchDeckUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pitch Deck URL (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating..." : "Create & Analyze"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
