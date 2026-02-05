import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Target, 
  DollarSign, 
  Building2, 
  MapPin, 
  Briefcase, 
  ArrowLeft,
  Loader2,
  TrendingUp,
  Lightbulb,
  Globe,
  Wallet
} from "lucide-react";
import { Link } from "wouter";
import { industryGroups } from "@/data/industries";

const thesisSchema = z.object({
  stages: z.array(z.string()).optional(),
  checkSizeMin: z.number().min(0).optional().nullable(),
  checkSizeMax: z.number().min(0).optional().nullable(),
  sectors: z.array(z.string()).optional(),
  geographies: z.array(z.string()).optional(),
  businessModels: z.array(z.string()).optional(),
  minRevenue: z.number().min(0).optional().nullable(),
  minGrowthRate: z.number().min(0).max(1000).optional().nullable(),
  thesisNarrative: z.string().optional(),
  antiPortfolio: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  fundSize: z.number().min(0).optional().nullable(),
});

// Helper function to format numbers with commas
function formatNumberWithCommas(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString("en-US");
}

// Helper function to parse comma-separated number
function parseFormattedNumber(value: string): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[,$]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

type ThesisFormData = z.infer<typeof thesisSchema>;

const stageOptions = [
  { value: "pre_seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c", label: "Series C+" },
  { value: "growth", label: "Growth" },
];

// Use industry groups from the shared data file
const sectorOptions = industryGroups.map((group) => ({
  value: group.value,
  label: group.label,
}));

const geoOptions = [
  { value: "us", label: "United States" },
  { value: "europe", label: "Europe" },
  { value: "latam", label: "Latin America" },
  { value: "asia", label: "Asia" },
  { value: "mena", label: "MENA" },
  { value: "global", label: "Global" },
];

const businessModelOptions = [
  { value: "b2b_saas", label: "B2B SaaS" },
  { value: "b2c_saas", label: "B2C SaaS" },
  { value: "marketplace", label: "Marketplace" },
  { value: "fintech", label: "Fintech/Lending" },
  { value: "hardware", label: "Hardware" },
  { value: "consumer", label: "Consumer App" },
  { value: "enterprise", label: "Enterprise Sales" },
  { value: "api", label: "API/Infrastructure" },
];

export default function InvestorThesis() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: existingThesis, isLoading } = useQuery({
    queryKey: ["/api/investor/thesis"],
  });

  const form = useForm<ThesisFormData>({
    resolver: zodResolver(thesisSchema),
    defaultValues: {
      stages: [],
      checkSizeMin: undefined,
      checkSizeMax: undefined,
      sectors: [],
      geographies: [],
      businessModels: [],
      minRevenue: undefined,
      minGrowthRate: undefined,
      thesisNarrative: "",
      antiPortfolio: "",
      website: "",
      fundSize: undefined,
    },
    values: existingThesis as ThesisFormData | undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ThesisFormData) => {
      const response = await apiRequest("POST", "/api/investor/thesis", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Thesis saved",
        description: "Your investment thesis has been updated. We'll start matching startups to your criteria.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/investor/thesis"] });
      navigate("/investor");
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ThesisFormData) => {
    saveMutation.mutate(data);
  };

  const CheckboxGroup = ({ 
    options, 
    value = [], 
    onChange,
    columns = 3
  }: { 
    options: { value: string; label: string }[]; 
    value: string[]; 
    onChange: (value: string[]) => void;
    columns?: number;
  }) => (
    <div className={`grid grid-cols-2 ${columns === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-2`}>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex items-center gap-2 p-2.5 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors"
        >
          <Checkbox
            checked={value.includes(option.value)}
            onCheckedChange={(checked) => {
              if (checked) {
                onChange([...value, option.value]);
              } else {
                onChange(value.filter((v) => v !== option.value));
              }
            }}
          />
          <span className="text-sm truncate">{option.label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild data-testid="button-back">
          <Link href="/investor">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Investment Thesis</h1>
          <p className="text-muted-foreground">
            Define your criteria for automatic startup matching
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Stage Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Stage Preferences
              </CardTitle>
              <CardDescription>
                What stages do you invest in?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="stages"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <CheckboxGroup
                        options={stageOptions}
                        value={field.value || []}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Check Size */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Check Size
              </CardTitle>
              <CardDescription>
                Typical investment range per deal (optional)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="checkSizeMin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            type="text"
                            placeholder="100,000"
                            className="pl-7"
                            value={formatNumberWithCommas(field.value)}
                            onChange={(e) => field.onChange(parseFormattedNumber(e.target.value))}
                            data-testid="input-check-min"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="checkSizeMax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            type="text"
                            placeholder="5,000,000"
                            className="pl-7"
                            value={formatNumberWithCommas(field.value)}
                            onChange={(e) => field.onChange(parseFormattedNumber(e.target.value))}
                            data-testid="input-check-max"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="minRevenue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum ARR (optional)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            type="text"
                            placeholder="1,000,000"
                            className="pl-7"
                            value={formatNumberWithCommas(field.value)}
                            onChange={(e) => field.onChange(parseFormattedNumber(e.target.value))}
                            data-testid="input-min-revenue"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Minimum annual recurring revenue
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Industry Groups */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Industry Groups
              </CardTitle>
              <CardDescription>
                Which industry groups are you focused on?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="sectors"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <CheckboxGroup
                        options={sectorOptions}
                        value={field.value || []}
                        onChange={field.onChange}
                        columns={4}
                      />
                    </FormControl>
                    <FormDescription>
                      Select all that apply ({sectorOptions.length} categories available)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Geography */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Geography
              </CardTitle>
              <CardDescription>
                Where do your portfolio companies operate?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="geographies"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <CheckboxGroup
                        options={geoOptions}
                        value={field.value || []}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Business Models */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="w-5 h-5" />
                Business Models
              </CardTitle>
              <CardDescription>
                What business models do you prefer?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="businessModels"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <CheckboxGroup
                        options={businessModelOptions}
                        value={field.value || []}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Fund Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                Fund Information
              </CardTitle>
              <CardDescription>
                Details about your fund (optional)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="url"
                            placeholder="https://yourfund.com"
                            className="pl-9"
                            {...field}
                            data-testid="input-website"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fundSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fund Size (AUM)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            type="text"
                            placeholder="50,000,000"
                            className="pl-7"
                            value={formatNumberWithCommas(field.value)}
                            onChange={(e) => field.onChange(parseFormattedNumber(e.target.value))}
                            data-testid="input-fund-size"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Total assets under management
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Thesis Narrative */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                Thesis Narrative
              </CardTitle>
              <CardDescription>
                Describe your investment thesis in your own words
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="thesisNarrative"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What makes a company interesting to you?</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="We look for companies that..."
                        className="min-h-[120px]"
                        {...field}
                        data-testid="input-thesis-narrative"
                      />
                    </FormControl>
                    <FormDescription>
                      Our AI will use this to better match you with relevant opportunities
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="antiPortfolio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What would you NOT invest in?</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="We avoid companies that..."
                        className="min-h-[80px]"
                        {...field}
                        data-testid="input-anti-portfolio"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" type="button" asChild data-testid="button-cancel">
              <Link href="/investor">Cancel</Link>
            </Button>
            <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-thesis">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Thesis
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
