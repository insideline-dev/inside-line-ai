import { useState, useRef, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

// Simple debounce hook
function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callbackRef = useRef(callback);

  // Update ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/query-client";
import { ObjectUploader } from "@/components/ObjectUploader";
import { TwoLevelIndustrySelector } from "@/components/TwoLevelIndustrySelector";
import { CurrencyInput } from "@/components/CurrencyInput";
import { CountryCodeSelector } from "@/components/CountryCodeSelector";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, Globe, FileText, Building2, MapPin, Loader2, CheckCircle, Users, Plus, Trash2, Linkedin, TrendingUp, Package, Video, Image, User, Mail, Phone, History, Info, Save, Cloud, CloudOff } from "lucide-react";

// API helper function
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Type for StartupDraft based on backend schema
interface StartupDraft {
  id: number;
  userId: string;
  startupId: number | null;
  formData: Record<string, any>;
  pitchDeckPath: string | null;
  uploadedFiles: any[] | null;
  teamMembers: any[] | null;
  productScreenshots: any[] | null;
  lastSavedAt: string;
  createdAt: string;
  updatedAt: string;
}

// Define base schema shape for type inference
const baseFormSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  website: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  description: z.string().optional(),
  stage: z.string().optional(),
  sectorIndustryGroup: z.string().optional(),
  sectorIndustry: z.string().optional(),
  location: z.string().optional(),
  roundSize: z.string().optional(),
  roundCurrency: z.string().default("USD"),
  valuation: z.string().optional(),
  valuationKnown: z.boolean().optional(),
  valuationType: z.enum(["pre_money", "post_money"]).optional(),
  raiseType: z.enum(["safe", "convertible_note", "equity", "safe_equity", "undecided"]).optional(),
  leadSecured: z.boolean().optional(),
  leadInvestorName: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  contactPhoneCountryCode: z.string().optional(),
  hasPreviousFunding: z.boolean().optional(),
  previousFundingAmount: z.string().optional(),
  previousFundingCurrency: z.string().optional(),
  previousInvestors: z.string().optional(),
  previousRoundType: z.string().optional(),
  technologyReadinessLevel: z.string().optional(),
  demoVideoUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  productDescription: z.string().optional(),
});

type SubmitFormData = z.infer<typeof baseFormSchema>;

const createSubmitSchema = (userRole: "founder" | "investor" | "admin" | "portal" | "scout", isWebsiteRequired: boolean = true) => {
  const websiteValidation = isWebsiteRequired
    ? z.string().url("Please enter a valid URL").min(1, "Website is required")
    : z.string().url("Please enter a valid URL").optional().or(z.literal(""));

  const baseSchema = z.object({
    name: z.string().min(1, "Company name is required"),
    website: websiteValidation,
    description: z.string().optional(),
    stage: z.string().optional(),
    sectorIndustryGroup: z.string().optional(),
    sectorIndustry: z.string().optional(),
    location: z.string().optional(),
    roundSize: z.string().optional(),
    roundCurrency: z.string().default("USD"),
    valuation: z.string().optional(),
    valuationKnown: z.boolean().optional(),
    valuationType: z.enum(["pre_money", "post_money"]).optional(),
    raiseType: z.enum(["safe", "convertible_note", "equity", "safe_equity", "undecided"]).optional(),
    leadSecured: z.boolean().optional(),
    leadInvestorName: z.string().optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().email("Please enter a valid email").optional().or(z.literal("")),
    contactPhone: z.string().optional(),
    contactPhoneCountryCode: z.string().optional(),
    hasPreviousFunding: z.boolean().optional(),
    previousFundingAmount: z.string().optional(),
    previousFundingCurrency: z.string().optional(),
    previousInvestors: z.string().optional(),
    previousRoundType: z.string().optional(),
    technologyReadinessLevel: z.string().optional(),
    demoVideoUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
    productDescription: z.string().optional(),
  });

  if (userRole === "founder" || userRole === "portal") {
    return baseSchema.extend({
      contactName: z.string().min(1, "Contact name is required"),
      contactEmail: z.string().email("Please enter a valid email").min(1, "Contact email is required"),
    });
  }

  return baseSchema;
};

interface UploadedFile {
  path: string;
  name: string;
  type: string;
}

interface TeamMember {
  name: string;
  role: string;
  linkedinUrl: string;
}

interface StartupSubmitFormProps {
  userRole: "founder" | "investor" | "admin" | "portal" | "scout";
  onSuccess?: () => void;
  redirectPath?: string;
  apiEndpoint?: string;
  portalSlug?: string;
  portalRequiredFields?: string[];
  enableDraftSaving?: boolean;
  draftId?: string | null;
}

export function StartupSubmitForm({
  userRole,
  onSuccess,
  redirectPath,
  apiEndpoint,
  portalSlug,
  portalRequiredFields = [],
  enableDraftSaving = false,
  draftId: draftIdProp,
}: StartupSubmitFormProps) {
  const effectiveEndpoint = portalSlug
    ? `/api/portal/${portalSlug}/submit`
    : (apiEndpoint || "/api/startups");
  const isPortalSubmission = !!portalSlug;
  const isWebsiteRequired = isPortalSubmission ? portalRequiredFields.includes("website") : true;
  const isPitchDeckRequired = isPortalSubmission ? portalRequiredFields.includes("pitchDeck") : false;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deckPath, setDeckPath] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([{ name: "", role: "", linkedinUrl: "" }]);
  const [productScreenshots, setProductScreenshots] = useState<string[]>([]);
  const filePathMapRef = useRef<Record<string, string>>({});
  const screenshotPathMapRef = useRef<Record<string, string>>({});

  const [draftId, setDraftId] = useState<number | null>(draftIdProp ? parseInt(draftIdProp) : null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState<boolean>(!!draftIdProp);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>("");
  const shouldSaveDraft = enableDraftSaving && userRole === "founder";

  const submitSchema = createSubmitSchema(userRole, isWebsiteRequired);

  const form = useForm<SubmitFormData>({
    resolver: zodResolver(submitSchema) as any,
    defaultValues: {
      name: "",
      website: "",
      description: "",
      stage: "",
      sectorIndustryGroup: "",
      sectorIndustry: "",
      location: "",
      roundSize: "",
      roundCurrency: "USD",
      valuation: "",
      valuationKnown: true,
      valuationType: undefined,
      raiseType: undefined,
      leadSecured: false,
      leadInvestorName: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      contactPhoneCountryCode: "US",
      hasPreviousFunding: false,
      previousFundingAmount: "",
      previousFundingCurrency: "USD",
      previousInvestors: "",
      previousRoundType: "",
      technologyReadinessLevel: "",
      demoVideoUrl: "",
      productDescription: "",
    },
  });

  const isInvestorOrAdmin = userRole === "investor" || userRole === "admin";
  const leadSecured = form.watch("leadSecured");
  const hasPreviousFunding = form.watch("hasPreviousFunding");
  const valuationKnown = form.watch("valuationKnown");

  // Load existing draft
  const { data: existingDraft } = useQuery<StartupDraft>({
    queryKey: ["/api/drafts", draftId],
    enabled: shouldSaveDraft && !!draftId,
  });

  // Populate form with draft data when loaded
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (existingDraft) {
      setIsLoadingDraft(true);
      const fd = existingDraft.formData as any;
      if (fd) {
        Object.keys(fd).forEach((key) => {
          if (fd[key] !== undefined && fd[key] !== null) {
            form.setValue(key as any, fd[key]);
          }
        });
      }
      if (existingDraft.pitchDeckPath) setDeckPath(existingDraft.pitchDeckPath);
      if (existingDraft.uploadedFiles) setUploadedFiles(existingDraft.uploadedFiles as any);
      if (existingDraft.teamMembers && (existingDraft.teamMembers as any[]).length > 0) {
        setTeamMembers(existingDraft.teamMembers as TeamMember[]);
      }
      if (existingDraft.productScreenshots) setProductScreenshots(existingDraft.productScreenshots as string[]);
      setLastSavedAt(new Date(existingDraft.lastSavedAt));
      setDraftStatus("saved");

      // Create initial snapshot after loading to prevent immediate resave
      const snapshot = JSON.stringify({
        form: form.getValues(),
        deckPath: existingDraft.pitchDeckPath,
        files: existingDraft.uploadedFiles,
        team: existingDraft.teamMembers,
        screenshots: existingDraft.productScreenshots,
      });
      setLastSavedSnapshot(snapshot);

      // Allow saves after a brief delay
      timeoutId = setTimeout(() => setIsLoadingDraft(false), 500);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [existingDraft, form]);

  // Save draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const formData = form.getValues();
      const payload = {
        formData,
        pitchDeckPath: deckPath,
        uploadedFiles: uploadedFiles.length > 0 ? uploadedFiles : null,
        teamMembers: teamMembers.filter(m => m.name || m.linkedinUrl),
        productScreenshots: productScreenshots.length > 0 ? productScreenshots : null,
      };

      if (draftId) {
        const response = await apiRequest("PATCH", `/api/drafts/${draftId}`, payload);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/drafts", payload);
        return response.json();
      }
    },
    onSuccess: (data) => {
      if (!draftId && data.id) {
        setDraftId(data.id);
      }
      setLastSavedAt(new Date());
      setDraftStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["/api/drafts"] });
    },
    onError: () => {
      setDraftStatus("error");
    },
  });

  // Delete draft mutation
  const deleteDraftMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/drafts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drafts"] });
    },
  });

  // Create a current snapshot for comparison
  const createSnapshot = useCallback(() => {
    return JSON.stringify({
      form: form.getValues(),
      deckPath,
      files: uploadedFiles,
      team: teamMembers.filter(m => m.name || m.linkedinUrl),
      screenshots: productScreenshots,
    });
  }, [form, deckPath, uploadedFiles, teamMembers, productScreenshots]);

  // Debounced auto-save with dirty check
  const debouncedSave = useDebouncedCallback(() => {
    if (!shouldSaveDraft || isLoadingDraft || saveDraftMutation.isPending) {
      return;
    }

    const currentSnapshot = createSnapshot();

    // Only save if data has actually changed
    if (currentSnapshot === lastSavedSnapshot) {
      return;
    }

    // Don't save if form is empty (no name)
    const formData = form.getValues();
    if (!formData.name?.trim()) {
      return;
    }

    setDraftStatus("saving");
    saveDraftMutation.mutate();
  }, 3000);

  // Update snapshot after successful save
  useEffect(() => {
    if (draftStatus === "saved") {
      setLastSavedSnapshot(createSnapshot());
    }
  }, [draftStatus, createSnapshot]);

  // Watch specific form fields for auto-save (avoiding full object comparison)
  const watchedName = form.watch("name");
  const watchedDescription = form.watch("description");
  const watchedWebsite = form.watch("website");
  const watchedStage = form.watch("stage");
  const watchedSector = form.watch("sectorIndustryGroup");
  const watchedLocation = form.watch("location");

  useEffect(() => {
    if (shouldSaveDraft && !isLoadingDraft && watchedName) {
      debouncedSave();
    }
  }, [watchedName, watchedDescription, watchedWebsite, watchedStage, watchedSector, watchedLocation, shouldSaveDraft, isLoadingDraft, debouncedSave]);

  // Also trigger save when files/team change
  useEffect(() => {
    if (shouldSaveDraft && !isLoadingDraft) {
      debouncedSave();
    }
  }, [deckPath, uploadedFiles.length, productScreenshots.length, teamMembers, shouldSaveDraft, isLoadingDraft, debouncedSave]);

  const submitMutation = useMutation({
    mutationFn: async (data: SubmitFormData) => {
      if (isPitchDeckRequired && !deckPath) {
        throw new Error("Pitch deck is required");
      }
      const validTeamMembers = teamMembers.filter(m => m.name.trim() || m.linkedinUrl.trim());
      const response = await apiRequest("POST", effectiveEndpoint, {
        ...data,
        stage: data.stage || undefined,
        sectorIndustryGroup: data.sectorIndustryGroup || undefined,
        sectorIndustry: data.sectorIndustry || undefined,
        roundSize: data.roundSize ? parseFloat(data.roundSize) : undefined,
        roundCurrency: data.roundCurrency || "USD",
        valuation: data.valuationKnown && data.valuation ? parseFloat(data.valuation) : undefined,
        valuationKnown: data.valuationKnown ?? true,
        valuationType: data.valuationKnown ? (data.valuationType || undefined) : undefined,
        raiseType: data.raiseType || undefined,
        leadSecured: data.leadSecured || false,
        leadInvestorName: data.leadSecured ? data.leadInvestorName : undefined,
        contactName: data.contactName || undefined,
        contactEmail: data.contactEmail || undefined,
        contactPhone: data.contactPhone || undefined,
        contactPhoneCountryCode: data.contactPhoneCountryCode || undefined,
        hasPreviousFunding: data.hasPreviousFunding || false,
        previousFundingAmount: data.hasPreviousFunding && data.previousFundingAmount ? parseFloat(data.previousFundingAmount) : undefined,
        previousFundingCurrency: data.hasPreviousFunding ? data.previousFundingCurrency : undefined,
        previousInvestors: data.hasPreviousFunding ? data.previousInvestors : undefined,
        previousRoundType: data.hasPreviousFunding ? data.previousRoundType : undefined,
        technologyReadinessLevel: data.technologyReadinessLevel || undefined,
        demoVideoUrl: data.demoVideoUrl || undefined,
        productDescription: data.productDescription || undefined,
        productScreenshots: productScreenshots.length > 0 ? productScreenshots : undefined,
        pitchDeckPath: deckPath,
        files: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        teamMembers: validTeamMembers.length > 0 ? validTeamMembers : undefined,
        submittedByRole: userRole,
        isPrivate: isInvestorOrAdmin,
      });
      return response.json();
    },
    onSuccess: () => {
      const successMessage = isInvestorOrAdmin
        ? "Startup submitted for analysis. You can view the report once complete."
        : "Your startup has been submitted for analysis. We'll notify you when it's complete.";

      toast.success(successMessage);

      // Delete draft after successful submission
      if (draftId) {
        deleteDraftMutation.mutate(draftId);
      }

      if (userRole === "investor") {
        queryClient.invalidateQueries({ queryKey: ["/api/investor/my-startups"] });
      } else if (userRole === "admin") {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/startups"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/startups"] });
      }

      if (onSuccess) {
        onSuccess();
      } else if (redirectPath) {
        navigate({ to: redirectPath as any });
      }
    },
    onError: (error) => {
      toast.error(error.message || "Something went wrong. Please try again.");
    },
  });

  const onSubmit = (data: SubmitFormData) => {
    submitMutation.mutate(data);
  };

  const onFormError = () => {
    toast.error("Some required fields are missing or invalid. Please check the form and try again.");
  };

  // Draft status indicator component
  const DraftStatusIndicator = () => {
    if (!shouldSaveDraft) return null;

    return (
      <div className="flex items-center gap-2 text-sm">
        {draftStatus === "saving" && (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Saving...</span>
          </>
        )}
        {draftStatus === "saved" && lastSavedAt && (
          <>
            <Cloud className="w-4 h-4 text-chart-2" />
            <span className="text-muted-foreground">
              Draft saved
            </span>
          </>
        )}
        {draftStatus === "error" && (
          <>
            <CloudOff className="w-4 h-4 text-destructive" />
            <span className="text-destructive">Save failed</span>
          </>
        )}
      </div>
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onFormError)} className="space-y-6">
        {/* Draft Status Banner */}
        {shouldSaveDraft && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Save className="w-4 h-4" />
              <span>Your progress is automatically saved as a draft</span>
            </div>
            <DraftStatusIndicator />
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Basic Information
            </CardTitle>
            <CardDescription>
              {isInvestorOrAdmin ? "Enter company details for analysis" : "Tell us about your company"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Inc." {...field} data-testid="input-name" />
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
                  <FormLabel>Company Website {isWebsiteRequired ? "*" : "(Optional)"}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input className="pl-10" placeholder="https://example.com" {...field} data-testid="input-website" />
                    </div>
                  </FormControl>
                  <FormDescription>
                    We'll analyze the website to extract product and company information
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>One-liner Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="We help companies do X by providing Y..."
                      className="resize-none"
                      {...field}
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <TwoLevelIndustrySelector
              groupValue={form.watch("sectorIndustryGroup")}
              industryValue={form.watch("sectorIndustry")}
              onGroupChange={(group) => form.setValue("sectorIndustryGroup", group)}
              onIndustryChange={(industry) => form.setValue("sectorIndustry", industry)}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input className="pl-10" placeholder="San Francisco, CA" {...field} data-testid="input-location" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              Team
            </CardTitle>
            <CardDescription>
              Add team members and their LinkedIn profiles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {teamMembers.map((member, index) => (
              <div
                key={index}
                className="flex flex-col sm:flex-row gap-3 p-4 rounded-lg border bg-muted/30"
                data-testid={`team-member-${index}`}
              >
                <div className="flex-1 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <Input
                        placeholder="John Smith"
                        value={member.name}
                        onChange={(e) => {
                          const updated = [...teamMembers];
                          updated[index].name = e.target.value;
                          setTeamMembers(updated);
                        }}
                        data-testid={`input-team-name-${index}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Role</Label>
                      <Input
                        placeholder="CEO, CTO, etc."
                        value={member.role}
                        onChange={(e) => {
                          const updated = [...teamMembers];
                          updated[index].role = e.target.value;
                          setTeamMembers(updated);
                        }}
                        data-testid={`input-team-role-${index}`}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Linkedin className="w-3 h-3" />
                      LinkedIn URL
                    </Label>
                    <Input
                      placeholder="https://linkedin.com/in/username"
                      value={member.linkedinUrl}
                      onChange={(e) => {
                        const updated = [...teamMembers];
                        updated[index].linkedinUrl = e.target.value;
                        setTeamMembers(updated);
                      }}
                      data-testid={`input-team-linkedin-${index}`}
                    />
                  </div>
                </div>
                {teamMembers.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 self-start"
                    onClick={() => {
                      setTeamMembers(prev => prev.filter((_, i) => i !== index));
                    }}
                    data-testid={`button-remove-team-${index}`}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setTeamMembers(prev => [...prev, { name: "", role: "", linkedinUrl: "" }]);
              }}
              data-testid="button-add-team-member"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Team Member
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="w-5 h-5" />
              Product
            </CardTitle>
            <CardDescription>
              Help us understand your product better (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="productDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe your product in detail - what it does, how it works, key features, technology stack, and what makes it unique..."
                      className="resize-none min-h-[120px]"
                      {...field}
                      data-testid="input-product-description"
                    />
                  </FormControl>
                  <FormDescription>
                    A detailed description helps our AI provide better analysis
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="technologyReadinessLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Technology Readiness Level</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-trl">
                        <SelectValue placeholder="Select product stage" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="idea">Idea - Concept or prototype stage</SelectItem>
                      <SelectItem value="mvp">MVP - Minimum viable product live</SelectItem>
                      <SelectItem value="scaling">Scaling - Product-market fit achieved</SelectItem>
                      <SelectItem value="mature">Mature - Established product</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Where is your product in its development lifecycle?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="demoVideoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Demo Video URL</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        className="pl-10"
                        placeholder="https://youtube.com/watch?v=..."
                        {...field}
                        data-testid="input-demo-video"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    YouTube, Loom, or other video demo link
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                Product Screenshots
              </Label>
              <p className="text-sm text-muted-foreground mb-2">
                Upload screenshots or diagrams of your product
              </p>

              {productScreenshots.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {productScreenshots.map((url, index) => (
                    <div
                      key={index}
                      className="relative group aspect-video bg-muted rounded-lg overflow-hidden border"
                      data-testid={`screenshot-${index}`}
                    >
                      <img
                        src={url}
                        alt={`Screenshot ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          setProductScreenshots(prev => prev.filter((_, i) => i !== index));
                        }}
                        data-testid={`button-remove-screenshot-${index}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <ObjectUploader
                maxNumberOfFiles={6}
                maxFileSize={10485760}
                onGetUploadParameters={async (file) => {
                  const res = await fetch("/api/uploads/request-url", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: file.name,
                      size: file.size,
                      contentType: file.type,
                      isPublic: true,
                    }),
                  });

                  if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(errorData.error || `Upload failed: ${res.status}`);
                  }

                  const data = await res.json();

                  if (!data.uploadURL) {
                    throw new Error("No upload URL received from server");
                  }

                  if (data.publicUrl) {
                    screenshotPathMapRef.current[file.id] = data.publicUrl;
                  } else if (data.objectPath) {
                    screenshotPathMapRef.current[file.id] = data.objectPath;
                  }

                  return {
                    method: "PUT",
                    url: data.uploadURL,
                    headers: { "Content-Type": file.type },
                  };
                }}
                onComplete={(result) => {
                  if (result.successful && result.successful.length > 0) {
                    const newUrls = result.successful
                      .map(file => screenshotPathMapRef.current[file.id])
                      .filter(Boolean);
                    setProductScreenshots(prev => [...prev, ...newUrls]);
                  }
                }}
                buttonClassName="w-full"
              >
                <Image className="w-4 h-4 mr-2" />
                {productScreenshots.length > 0 ? 'Add More Screenshots' : 'Upload Screenshots'}
              </ObjectUploader>

              <p className="text-xs text-muted-foreground">
                Upload up to 6 images (max 10MB each)
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Documents
            </CardTitle>
            <CardDescription>
              Upload pitch deck{isPitchDeckRequired ? " (required)" : ""}, financials, product demos, and other supporting materials
            </CardDescription>
          </CardHeader>
          <CardContent>
            {uploadedFiles.length > 0 && (
              <div className="space-y-2 mb-4">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-3 rounded-lg bg-chart-2/10 border border-chart-2/20"
                    data-testid={`uploaded-file-${index}`}
                  >
                    <CheckCircle className="w-5 h-5 text-chart-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.type || 'Document'}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUploadedFiles(prev => prev.filter((_, i) => i !== index));
                      }}
                      data-testid={`button-remove-file-${index}`}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <ObjectUploader
              maxNumberOfFiles={10}
              maxFileSize={52428800}
              onGetUploadParameters={async (file) => {
                const res = await fetch("/api/uploads/request-url", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: file.name,
                    size: file.size,
                    contentType: file.type,
                  }),
                });

                if (!res.ok) {
                  const errorData = await res.json().catch(() => ({}));
                  throw new Error(errorData.error || `Upload failed: ${res.status}`);
                }

                const data = await res.json();

                if (!data.uploadURL) {
                  throw new Error("No upload URL received from server");
                }

                if (data.objectPath) {
                  filePathMapRef.current[file.id] = data.objectPath;
                }

                return {
                  method: "PUT",
                  url: data.uploadURL,
                  headers: { "Content-Type": file.type },
                };
              }}
              onComplete={(result) => {
                if (result.successful && result.successful.length > 0) {
                  const newFiles = result.successful.map(file => {
                    const storedPath = filePathMapRef.current[file.id];
                    return {
                      name: file.name,
                      path: storedPath || '',
                      type: file.type || 'application/octet-stream',
                    };
                  }).filter(f => f.path);
                  setUploadedFiles(prev => [...prev, ...newFiles]);
                  if (!deckPath && newFiles.length > 0) {
                    setDeckPath(newFiles[0].path);
                  }
                }
              }}
              buttonClassName="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploadedFiles.length > 0 ? 'Add More Files' : 'Upload Files'}
            </ObjectUploader>

            <p className="text-xs text-muted-foreground mt-2">
              Upload up to 10 files (pitch deck, financials, product demos, etc.)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Round Details
            </CardTitle>
            <CardDescription>
              Current fundraising information (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stage</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-stage">
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pre_seed">Pre-seed</SelectItem>
                        <SelectItem value="seed">Seed</SelectItem>
                        <SelectItem value="series_a">Series A</SelectItem>
                        <SelectItem value="series_b">Series B</SelectItem>
                        <SelectItem value="series_c">Series C</SelectItem>
                        <SelectItem value="series_d">Series D</SelectItem>
                        <SelectItem value="series_e">Series E</SelectItem>
                        <SelectItem value="series_f_plus">Series F+</SelectItem>
                        <SelectItem value="growth">Growth</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="roundSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Round Size</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value || ""}
                        currency={form.watch("roundCurrency") || "USD"}
                        onValueChange={(value) => field.onChange(value)}
                        onCurrencyChange={(currency) => form.setValue("roundCurrency", currency)}
                        placeholder="1,000,000"
                        testId="input-round-size"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FormLabel className="text-base font-medium mb-0">Target Valuation</FormLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[280px]">
                      <p>To better assess and match with the right investors, we encourage you to provide an approximation.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <FormField
                  control={form.control}
                  name="valuationKnown"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <FormLabel className="font-normal text-sm text-muted-foreground cursor-pointer mb-0">
                        {field.value ? "Known" : "Not yet determined"}
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-valuation-known"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {valuationKnown ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="valuation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <CurrencyInput
                            value={field.value || ""}
                            currency={form.watch("roundCurrency") || "USD"}
                            onValueChange={(value) => field.onChange(value)}
                            showCurrencySelector={false}
                            placeholder="10,000,000"
                            testId="input-valuation"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="valuationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-valuation-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pre_money">Pre-money</SelectItem>
                            <SelectItem value="post_money">Post-money</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You can update this later once you have a target valuation in mind.
                </p>
              )}
            </div>

            <FormField
              control={form.control}
              name="raiseType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raise Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-raise-type">
                        <SelectValue placeholder="Select raise type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="safe">SAFE</SelectItem>
                      <SelectItem value="convertible_note">Convertible Note</SelectItem>
                      <SelectItem value="equity">Equity</SelectItem>
                      <SelectItem value="safe_equity">SAFE + Equity</SelectItem>
                      <SelectItem value="undecided">Undecided</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="leadSecured"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Lead Investor Secured?</FormLabel>
                    <FormDescription>
                      Do you have a committed lead investor for this round?
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-lead-secured"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {leadSecured && (
              <FormField
                control={form.control}
                name="leadInvestorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Investor Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Sequoia Capital, a]16z, etc."
                        {...field}
                        data-testid="input-lead-investor-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {(userRole === "founder" || userRole === "portal") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Primary Contact
              </CardTitle>
              <CardDescription>
                Your contact information for investor outreach (required)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          className="pl-10"
                          placeholder="John Smith"
                          {...field}
                          data-testid="input-contact-name"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          className="pl-10"
                          type="email"
                          placeholder="john@company.com"
                          {...field}
                          data-testid="input-contact-email"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Label>Phone Number</Label>
                <div className="flex gap-2">
                  <CountryCodeSelector
                    value={form.watch("contactPhoneCountryCode") || "US"}
                    onValueChange={(code) => form.setValue("contactPhoneCountryCode", code)}
                  />
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      placeholder="(555) 123-4567"
                      value={form.watch("contactPhone") || ""}
                      onChange={(e) => form.setValue("contactPhone", e.target.value)}
                      data-testid="input-contact-phone"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-5 h-5" />
              Previous Funding
            </CardTitle>
            <CardDescription>
              Information about prior funding rounds (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="hasPreviousFunding"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Have you raised funding before?</FormLabel>
                    <FormDescription>
                      Toggle if you've received prior investment
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-has-previous-funding"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {hasPreviousFunding && (
              <>
                <FormField
                  control={form.control}
                  name="previousFundingAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Amount Raised</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value || ""}
                          currency={form.watch("previousFundingCurrency") || "USD"}
                          onValueChange={(value) => field.onChange(value)}
                          onCurrencyChange={(currency) => form.setValue("previousFundingCurrency", currency)}
                          placeholder="500,000"
                          testId="input-previous-funding-amount"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="previousInvestors"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Previous Investors</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Y Combinator, Techstars, Angel investors..."
                          className="resize-none"
                          {...field}
                          data-testid="input-previous-investors"
                        />
                      </FormControl>
                      <FormDescription>
                        List key investors from previous rounds
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="previousRoundType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Round Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-previous-round-type">
                            <SelectValue placeholder="Select round type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="safe">SAFE</SelectItem>
                          <SelectItem value="convertible_note">Convertible Note</SelectItem>
                          <SelectItem value="equity">Equity</SelectItem>
                          <SelectItem value="safe_equity">SAFE + Equity</SelectItem>
                          <SelectItem value="undecided">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Button
          type="submit"
          className="w-full"
          disabled={submitMutation.isPending}
          data-testid="button-submit"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Submit for Analysis
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
