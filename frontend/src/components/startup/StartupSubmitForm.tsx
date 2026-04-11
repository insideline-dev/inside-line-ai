import { useState, useRef, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  useStartupControllerCreate,
  useStartupControllerSubmit,
  useStartupControllerUpdate,
  useStartupControllerFindOne,
  useStartupControllerRegisterDataRoomFilesBulk,
} from "@/api/generated/startups/startups";
import { usePortalControllerSubmitToPortal } from "@/api/generated/portal/portal";
import { useStorageControllerGetUploadUrl } from "@/api/generated/storage/storage";
import type {
  CreateStartupDto,
  GetUploadUrlDtoContentType,
  SubmitToPortalDto,
  UpdateStartupDto,
} from "@/api/generated/model";
import type { Startup } from "@/types";

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
import { Badge } from "@/components/ui/badge";
import { useDataRoomClassification } from "@/lib/auth/useSocket";
import { formatAgentLabels, formatCategoryLabel } from "@/lib/agent-labels";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/query-client";
import { ObjectUploader } from "@/components/ObjectUploader";
import { TwoLevelIndustrySelector } from "@/components/TwoLevelIndustrySelector";
import { CurrencyInput } from "@/components/CurrencyInput";
import { CountryCodeSelector } from "@/components/CountryCodeSelector";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, Globe, FileText, Building2, MapPin, Loader2, CheckCircle, Users, Plus, Trash2, Linkedin, TrendingUp, Package, Video, Image, User, Mail, Phone, History, Info, Save, Cloud, CloudOff } from "lucide-react";

// Define base schema shape for type inference
const baseFormSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  tagline: z.string().max(500, "Tagline is too long").optional().or(z.literal("")),
  website: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  description: z.string().max(5000).optional().or(z.literal("")),
  stage: z.string().min(1, "Stage is required"),
  sectorIndustryGroup: z.string().optional(),
  sectorIndustry: z.string().optional(),
  location: z.string().min(1, "Location is required"),
  fundingTarget: z.string().min(1, "Round size is required"),
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
    tagline: z.string().max(500, "Tagline is too long").optional().or(z.literal("")),
    website: websiteValidation,
    description: z.string().max(5000).optional().or(z.literal("")),
    stage: z.string().min(1, "Stage is required"),
    sectorIndustryGroup: z.string().optional(),
    sectorIndustry: z.string().optional(),
    location: z.string().min(1, "Location is required"),
    fundingTarget: z.string().min(1, "Round size is required"),
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
  publicUrl?: string;
  size?: number;
  dataRoomId?: string;
  classificationStatus?: "pending" | "classifying" | "completed" | "failed";
  classificationCategory?: string;
  classificationConfidence?: number;
  routedAgents?: string[];
  classificationError?: string;
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
  showPrimaryContactSection?: boolean;
  onSubmitStartup?: (payload: CreateStartupDto) => Promise<void | { id?: string }>;
  successMessage?: string;
}

interface StoredDraft {
  formData: SubmitFormData;
  deckPath: string | null;
  uploadedFiles: UploadedFile[];
  teamMembers: TeamMember[];
  productScreenshots: string[];
  savedAt: string;
}

function unwrapApiResponse<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  ) {
    return (payload as Record<string, unknown>).data as T;
  }

  return payload as T;
}

const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const SUPPORTED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ...SUPPORTED_IMAGE_TYPES,
] as const;

function isPdfFileType(fileType: string | undefined): boolean {
  return fileType === "application/pdf";
}

function isImageFileType(fileType: string | undefined): boolean {
  return !!fileType && SUPPORTED_IMAGE_TYPES.includes(fileType as (typeof SUPPORTED_IMAGE_TYPES)[number]);
}

function getDefaultDeckPath(files: UploadedFile[]): string | null {
  const firstPdf = files.find((file) => isPdfFileType(file.type));
  return firstPdf?.path ?? null;
}

function toSupportedContentType(fileType: string): GetUploadUrlDtoContentType {
  if (
    SUPPORTED_DOCUMENT_TYPES.includes(
      fileType as (typeof SUPPORTED_DOCUMENT_TYPES)[number],
    )
  ) {
    return fileType as GetUploadUrlDtoContentType;
  }

  throw new Error(`Unsupported content type: ${fileType}`);
}

function normalizeOptionalText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveNumberInput(value?: string): number | undefined {
  const normalized = value?.replace(/,/g, "").trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
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
  showPrimaryContactSection,
  onSubmitStartup,
  successMessage,
}: StartupSubmitFormProps) {
  void apiEndpoint;
  const isPortalSubmission = !!portalSlug;
  const isWebsiteRequired = isPortalSubmission ? portalRequiredFields.includes("website") : true;
  const isPitchDeckRequired = isPortalSubmission ? portalRequiredFields.includes("pitchDeck") : false;
  const primaryContactRequired = userRole === "founder" || userRole === "portal";
  const shouldShowPrimaryContactSection =
    showPrimaryContactSection ?? primaryContactRequired;
  const draftStorageKey = "startup-submit-draft-v1";
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deckPath, setDeckPath] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([{ name: "", role: "", linkedinUrl: "" }]);
  const [productScreenshots, setProductScreenshots] = useState<string[]>([]);
  const filePathMapRef = useRef<Record<string, string>>({});
  const filePublicUrlMapRef = useRef<Record<string, string>>({});
  const screenshotPathMapRef = useRef<Record<string, string>>({});
  const shouldSaveDraft = enableDraftSaving && userRole === "founder";

  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState<boolean>(shouldSaveDraft);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>("");

  const submitSchema = createSubmitSchema(userRole, isWebsiteRequired);
  const createStartupMutation = useStartupControllerCreate();
  const submitStartupMutation = useStartupControllerSubmit();
  const updateStartupMutation = useStartupControllerUpdate();
  const registerDataRoomFilesBulkMutation =
    useStartupControllerRegisterDataRoomFilesBulk();
  const portalSubmitMutation = usePortalControllerSubmitToPortal();
  const uploadUrlMutation = useStorageControllerGetUploadUrl();

  // Backend draft tracking
  const [startupId, setStartupId] = useState<string | null>(draftIdProp ?? null);
  const registeredFilePathsRef = useRef<Set<string>>(new Set());
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // Load existing draft from backend when draftId prop is provided
  const existingDraftQuery = useStartupControllerFindOne(draftIdProp ?? "", {
    query: { enabled: !!draftIdProp },
  });

  const form = useForm<SubmitFormData>({
    resolver: zodResolver(submitSchema) as any,
    defaultValues: {
      name: "",
      tagline: "",
      website: "",
      description: "",
      stage: "",
      sectorIndustryGroup: "",
      sectorIndustry: "",
      location: "",
      fundingTarget: "",
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

  // Load local draft snapshot
  useEffect(() => {
    if (!shouldSaveDraft) {
      setIsLoadingDraft(false);
      return;
    }

    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as StoredDraft;
      if (parsed.formData) {
        Object.entries(parsed.formData).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            form.setValue(key as keyof SubmitFormData, value as never);
          }
        });
      }
      const draftFiles = parsed.uploadedFiles ?? [];
      setUploadedFiles(draftFiles);
      const restoredDeckPath =
        parsed.deckPath &&
        draftFiles.some(
          (file) => file.path === parsed.deckPath && isPdfFileType(file.type),
        )
          ? parsed.deckPath
          : getDefaultDeckPath(draftFiles);
      setDeckPath(restoredDeckPath);
      setTeamMembers(parsed.teamMembers?.length ? parsed.teamMembers : [{ name: "", role: "", linkedinUrl: "" }]);
      setProductScreenshots(parsed.productScreenshots ?? []);
      if (parsed.savedAt) {
        setLastSavedAt(new Date(parsed.savedAt));
      }

      const snapshot = JSON.stringify({
        form: parsed.formData,
        deckPath: restoredDeckPath,
        files: draftFiles,
        team: parsed.teamMembers,
        screenshots: parsed.productScreenshots,
      });
      setLastSavedSnapshot(snapshot);
      setDraftStatus("saved");
    } catch {
      setDraftStatus("error");
    } finally {
      setIsLoadingDraft(false);
    }
  }, [form, shouldSaveDraft]);

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
    if (!shouldSaveDraft || isLoadingDraft) {
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
    const payload: StoredDraft = {
      formData,
      deckPath,
      uploadedFiles,
      teamMembers: teamMembers.filter((m) => m.name || m.linkedinUrl),
      productScreenshots,
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      setLastSavedAt(new Date(payload.savedAt));
      setLastSavedSnapshot(currentSnapshot);
      setDraftStatus("saved");
    } catch {
      setDraftStatus("error");
    }
  }, 3000);

  // Watch specific form fields for auto-save (avoiding full object comparison)
  const watchedName = form.watch("name");
  const watchedTagline = form.watch("tagline");
  const watchedDescription = form.watch("description");
  const watchedWebsite = form.watch("website");
  const watchedStage = form.watch("stage");
  const watchedSector = form.watch("sectorIndustryGroup");
  const watchedLocation = form.watch("location");

  useEffect(() => {
    if (shouldSaveDraft && !isLoadingDraft && watchedName) {
      debouncedSave();
    }
  }, [watchedName, watchedTagline, watchedDescription, watchedWebsite, watchedStage, watchedSector, watchedLocation, shouldSaveDraft, isLoadingDraft, debouncedSave]);

  // Also trigger save when files/team change
  useEffect(() => {
    if (shouldSaveDraft && !isLoadingDraft) {
      debouncedSave();
    }
  }, [deckPath, uploadedFiles.length, productScreenshots.length, teamMembers, shouldSaveDraft, isLoadingDraft, debouncedSave]);

  const submitMutation = useMutation({
    mutationFn: async (data: SubmitFormData) => {
      const fundingTarget = parsePositiveNumberInput(data.fundingTarget);
      if (fundingTarget === undefined) {
        throw new Error("Round size must be a positive number");
      }

      const validTeamMembers = teamMembers
        .map((member) => ({
          name: member.name.trim(),
          role: member.role.trim(),
          linkedinUrl: member.linkedinUrl.trim(),
        }))
        .filter((member) => member.name || member.role || member.linkedinUrl);

      const normalizedFiles = uploadedFiles
        .map((file) => ({
          path: file.path.trim(),
          name: file.name.trim(),
          type: file.type.trim(),
        }))
        .filter((file) => file.path && file.name && file.type);

      const pitchDeckFile =
        uploadedFiles.find(
          (file) => file.path === deckPath && isPdfFileType(file.type),
        ) ?? uploadedFiles.find((file) => isPdfFileType(file.type));
      const pitchDeckPath =
        deckPath && normalizedFiles.some((file) => file.path === deckPath)
          ? deckPath
          : getDefaultDeckPath(uploadedFiles);
      const website = data.website?.trim();
      const valuation = parsePositiveNumberInput(data.valuation);
      const previousFundingAmount = parsePositiveNumberInput(
        data.previousFundingAmount,
      );
      const productScreenshotsToPersist = productScreenshots
        .map((url) => url.trim())
        .filter(Boolean);
      const demoVideoUrl = normalizeOptionalText(data.demoVideoUrl);
      const contactEmail = normalizeOptionalText(data.contactEmail);
      const valuationKnown =
        typeof data.valuationKnown === "boolean" ? data.valuationKnown : undefined;
      const hasPreviousFunding =
        typeof data.hasPreviousFunding === "boolean"
          ? data.hasPreviousFunding
          : undefined;

      if (!website) {
        throw new Error("Website is required");
      }

      if (isPortalSubmission) {
        if (!portalSlug) {
          throw new Error("Portal slug is missing");
        }

        const founderEmail = normalizeOptionalText(data.contactEmail);
        if (!founderEmail) {
          throw new Error("Contact email is required");
        }

        const submitPayload: SubmitToPortalDto = {
          name: data.name.trim(),
          tagline: data.tagline?.trim() || "",
          description: data.description?.trim() || "",
          website,
          location: data.location.trim(),
          industry:
            data.sectorIndustry?.trim() ||
            data.sectorIndustryGroup?.trim() ||
            "general",
          stage: data.stage as SubmitToPortalDto["stage"],
          fundingTarget: Math.round(fundingTarget),
          teamSize: Math.max(validTeamMembers.length, 1),
          pitchDeckUrl: pitchDeckFile?.publicUrl,
          demoUrl: demoVideoUrl,
          founderEmail,
          founderName: normalizeOptionalText(data.contactName),
        };

        await portalSubmitMutation.mutateAsync({
          slug: portalSlug,
          data: submitPayload,
        });

        return { id: "portal-submission" };
      }

      if (isPitchDeckRequired && !pitchDeckFile) {
        throw new Error("Pitch deck PDF is required");
      }

      const createPayload = {
        name: data.name.trim(),
        tagline: data.tagline?.trim() || "",
        description: data.description?.trim() || "",
        website,
        location: data.location.trim(),
        industry:
          data.sectorIndustry?.trim() ||
          data.sectorIndustryGroup?.trim() ||
          "general",
        stage: data.stage as CreateStartupDto["stage"],
        fundingTarget: Math.round(fundingTarget),
        teamSize: Math.max(validTeamMembers.length, 1),
        sectorIndustryGroup: normalizeOptionalText(data.sectorIndustryGroup),
        sectorIndustry: normalizeOptionalText(data.sectorIndustry),
        pitchDeckUrl: pitchDeckFile?.publicUrl,
        pitchDeckPath: pitchDeckPath || undefined,
        files: normalizedFiles.length ? normalizedFiles : undefined,
        teamMembers: validTeamMembers.length ? validTeamMembers : undefined,
        roundCurrency: normalizeOptionalText(data.roundCurrency) || "USD",
        valuation,
        valuationKnown,
        valuationType: valuationKnown ? data.valuationType : undefined,
        raiseType: data.raiseType,
        leadSecured: data.leadSecured,
        leadInvestorName: normalizeOptionalText(data.leadInvestorName),
        contactName: normalizeOptionalText(data.contactName),
        contactEmail,
        contactPhone: normalizeOptionalText(data.contactPhone),
        contactPhoneCountryCode: normalizeOptionalText(
          data.contactPhoneCountryCode,
        ),
        hasPreviousFunding,
        previousFundingAmount:
          hasPreviousFunding === false ? undefined : previousFundingAmount,
        previousFundingCurrency:
          hasPreviousFunding === false
            ? undefined
            : normalizeOptionalText(data.previousFundingCurrency),
        previousInvestors:
          hasPreviousFunding === false
            ? undefined
            : normalizeOptionalText(data.previousInvestors),
        previousRoundType:
          hasPreviousFunding === false
            ? undefined
            : normalizeOptionalText(data.previousRoundType),
        technologyReadinessLevel: data.technologyReadinessLevel,
        demoVideoUrl,
        productDescription: normalizeOptionalText(data.productDescription),
        productScreenshots: productScreenshotsToPersist.length
          ? productScreenshotsToPersist
          : undefined,
        // Keep backward-compatible field used in older flows.
        demoUrl: demoVideoUrl,
      } as CreateStartupDto;

      if (onSubmitStartup) {
        await onSubmitStartup(createPayload);
        return { id: "external-submission" };
      }

      // If a draft was already saved, update instead of creating a new startup.
      let targetId = startupId;
      if (targetId) {
        await updateStartupMutation.mutateAsync({
          id: targetId,
          data: createPayload as UpdateStartupDto,
        });
      } else {
        const createResult = await createStartupMutation.mutateAsync({
          data: createPayload,
        });
        const created = unwrapApiResponse<{ id?: string }>(createResult);
        targetId = created?.id ?? null;
      }

      if (!targetId) {
        throw new Error("Startup was created but no startup id was returned");
      }

      // Register any not-yet-registered files into the data room.
      await registerPendingFilesToDataRoom(targetId, normalizedFiles);

      await submitStartupMutation.mutateAsync({
        id: targetId,
        data: {},
      });

      return { id: targetId };
    },
    onSuccess: () => {
      const resolvedSuccessMessage = successMessage ?? (isInvestorOrAdmin
        ? "Startup submitted for analysis."
        : "Your startup has been submitted and the AI pipeline has started.");

      toast.success(resolvedSuccessMessage);

      if (shouldSaveDraft) {
        localStorage.removeItem(draftStorageKey);
      }

      if (!onSubmitStartup) {
        queryClient.invalidateQueries({ queryKey: ["/startups"] });
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

  // Register files uploaded via presigned URL into the data room. Skips files
  // that have already been registered in this session.
  const registerPendingFilesToDataRoom = useCallback(
    async (
      targetStartupId: string,
      files: Array<{ path: string; name: string; type: string }>,
    ) => {
      const pending = files.filter(
        (f) => f.path && !registeredFilePathsRef.current.has(f.path),
      );
      if (pending.length === 0) return;

      const payload = pending.map((f) => {
        const match = uploadedFiles.find((u) => u.path === f.path);
        return {
          path: f.path,
          name: f.name,
          type: f.type,
          size: typeof match?.size === "number" ? match.size : 0,
        };
      });

      const pendingPaths = new Set(pending.map((f) => f.path));
      setUploadedFiles((prev) =>
        prev.map((file) =>
          pendingPaths.has(file.path)
            ? { ...file, classificationStatus: "pending" as const }
            : file,
        ),
      );

      try {
        await registerDataRoomFilesBulkMutation.mutateAsync({
          id: targetStartupId,
          data: { files: payload },
        });
        pending.forEach((f) => registeredFilePathsRef.current.add(f.path));
      } catch (err) {
        // Non-fatal: the startup itself is saved — log and continue.
        console.warn("[StartupSubmitForm] data room register failed", err);
      }
    },
    [uploadedFiles, registerDataRoomFilesBulkMutation],
  );

  // Live classification feedback for files in the data room.
  useDataRoomClassification(startupId, {
    onClassifying: (event) => {
      setUploadedFiles((prev) =>
        prev.map((file) =>
          file.name === event.fileName
            ? {
                ...file,
                dataRoomId: event.dataRoomId,
                classificationStatus: "classifying",
              }
            : file,
        ),
      );
    },
    onClassified: (event) => {
      setUploadedFiles((prev) =>
        prev.map((file) =>
          file.name === event.fileName
            ? {
                ...file,
                dataRoomId: event.dataRoomId,
                classificationStatus: "completed",
                classificationCategory: event.category,
                classificationConfidence: event.confidence,
                routedAgents: event.routedAgents,
                classificationError: undefined,
              }
            : file,
        ),
      );
    },
    onFailed: (event) => {
      setUploadedFiles((prev) =>
        prev.map((file) =>
          file.name === event.fileName
            ? {
                ...file,
                dataRoomId: event.dataRoomId,
                classificationStatus: "failed",
                classificationError: event.error,
              }
            : file,
        ),
      );
    },
  });

  // Populate form from an existing backend draft when editing.
  useEffect(() => {
    if (!draftIdProp) return;
    const data = existingDraftQuery.data as unknown;
    const startup = unwrapApiResponse<Partial<Startup> | null>(data);
    if (!startup || !startup.id) return;

    setStartupId(startup.id);

    const setField = <K extends keyof SubmitFormData>(
      key: K,
      value: SubmitFormData[K] | undefined | null,
    ) => {
      if (value !== undefined && value !== null && value !== "") {
        form.setValue(key, value as never);
      }
    };

    setField("name", startup.name as never);
    setField("tagline", startup.tagline as never);
    setField("description", startup.description as never);
    setField("website", startup.website as never);
    setField("location", startup.location as never);
    setField("stage", startup.stage as never);
    setField("sectorIndustryGroup", startup.sectorIndustryGroup as never);
    setField("sectorIndustry", startup.sectorIndustry as never);
    setField(
      "fundingTarget",
      (startup.fundingTarget != null ? String(startup.fundingTarget) : "") as never,
    );
    setField("roundCurrency", (startup.roundCurrency as never) ?? ("USD" as never));
    setField(
      "valuation",
      (startup.valuation != null ? String(startup.valuation) : "") as never,
    );
    setField("valuationKnown", startup.valuationKnown as never);
    setField("valuationType", startup.valuationType as never);
    setField("raiseType", startup.raiseType as never);
    setField("leadSecured", startup.leadSecured as never);
    setField("leadInvestorName", startup.leadInvestorName as never);
    setField("contactName", startup.contactName as never);
    setField("contactEmail", startup.contactEmail as never);
    setField("contactPhone", startup.contactPhone as never);
    setField("contactPhoneCountryCode", startup.contactPhoneCountryCode as never);
    setField("hasPreviousFunding", startup.hasPreviousFunding as never);
    setField(
      "previousFundingAmount",
      (startup.previousFundingAmount != null
        ? String(startup.previousFundingAmount)
        : "") as never,
    );
    setField("previousFundingCurrency", startup.previousFundingCurrency as never);
    setField("previousInvestors", startup.previousInvestors as never);
    setField("previousRoundType", startup.previousRoundType as never);
    setField("technologyReadinessLevel", startup.technologyReadinessLevel as never);
    setField("demoVideoUrl", startup.demoVideoUrl as never);
    setField("productDescription", startup.productDescription as never);

    if (Array.isArray(startup.teamMembers) && startup.teamMembers.length) {
      setTeamMembers(
        startup.teamMembers.map((m) => ({
          name: m.name ?? "",
          role: m.role ?? "",
          linkedinUrl: m.linkedinUrl ?? "",
        })),
      );
    }
    if (Array.isArray(startup.productScreenshots)) {
      setProductScreenshots(startup.productScreenshots);
    }
    if (Array.isArray(startup.files)) {
      const restored: UploadedFile[] = startup.files.map((f) => ({
        path: f.path,
        name: f.name,
        type: f.type,
      }));
      setUploadedFiles(restored);
      restored.forEach((f) => registeredFilePathsRef.current.add(f.path));
      setDeckPath(startup.pitchDeckPath ?? getDefaultDeckPath(restored));
    }
    setIsLoadingDraft(false);
  }, [draftIdProp, existingDraftQuery.data, form]);

  const onSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const data = form.getValues();
      if (!data.name?.trim()) {
        toast.error("Please enter a startup name before saving a draft.");
        return;
      }

      const validTeamMembers = teamMembers
        .map((member) => ({
          name: member.name.trim(),
          role: member.role.trim(),
          linkedinUrl: member.linkedinUrl.trim(),
        }))
        .filter((member) => member.name || member.role || member.linkedinUrl);

      const normalizedFiles = uploadedFiles
        .map((file) => ({
          path: file.path.trim(),
          name: file.name.trim(),
          type: file.type.trim(),
        }))
        .filter((file) => file.path && file.name && file.type);

      const pitchDeckFile =
        uploadedFiles.find(
          (file) => file.path === deckPath && isPdfFileType(file.type),
        ) ?? uploadedFiles.find((file) => isPdfFileType(file.type));
      const pitchDeckPath =
        deckPath && normalizedFiles.some((file) => file.path === deckPath)
          ? deckPath
          : getDefaultDeckPath(uploadedFiles);

      const draftPayload: Partial<CreateStartupDto> = {
        name: data.name.trim(),
        tagline: data.tagline?.trim() || "",
        description: data.description?.trim() || "",
        website: data.website?.trim() || "",
        location: data.location?.trim() || "",
        industry:
          data.sectorIndustry?.trim() ||
          data.sectorIndustryGroup?.trim() ||
          "general",
        sectorIndustryGroup: normalizeOptionalText(data.sectorIndustryGroup),
        sectorIndustry: normalizeOptionalText(data.sectorIndustry),
        stage: (data.stage || undefined) as CreateStartupDto["stage"],
        fundingTarget:
          parsePositiveNumberInput(data.fundingTarget) != null
            ? Math.round(parsePositiveNumberInput(data.fundingTarget) as number)
            : undefined,
        teamSize: Math.max(validTeamMembers.length, 1),
        pitchDeckUrl: pitchDeckFile?.publicUrl,
        pitchDeckPath: pitchDeckPath || undefined,
        files: normalizedFiles.length ? normalizedFiles : undefined,
        teamMembers: validTeamMembers.length ? validTeamMembers : undefined,
        roundCurrency: normalizeOptionalText(data.roundCurrency) || "USD",
        valuation: parsePositiveNumberInput(data.valuation),
        valuationKnown:
          typeof data.valuationKnown === "boolean" ? data.valuationKnown : undefined,
        valuationType: data.valuationKnown ? data.valuationType : undefined,
        raiseType: data.raiseType,
        leadSecured: data.leadSecured,
        leadInvestorName: normalizeOptionalText(data.leadInvestorName),
        contactName: normalizeOptionalText(data.contactName),
        contactEmail: normalizeOptionalText(data.contactEmail),
        contactPhone: normalizeOptionalText(data.contactPhone),
        contactPhoneCountryCode: normalizeOptionalText(data.contactPhoneCountryCode),
        hasPreviousFunding:
          typeof data.hasPreviousFunding === "boolean"
            ? data.hasPreviousFunding
            : undefined,
        previousFundingAmount: parsePositiveNumberInput(data.previousFundingAmount),
        previousFundingCurrency: normalizeOptionalText(data.previousFundingCurrency),
        previousInvestors: normalizeOptionalText(data.previousInvestors),
        previousRoundType: normalizeOptionalText(data.previousRoundType),
        technologyReadinessLevel:
          (data.technologyReadinessLevel as CreateStartupDto["technologyReadinessLevel"]) ||
          undefined,
        demoVideoUrl: normalizeOptionalText(data.demoVideoUrl),
        productDescription: normalizeOptionalText(data.productDescription),
        productScreenshots: productScreenshots.length ? productScreenshots : undefined,
      };

      let targetId = startupId;
      if (targetId) {
        await updateStartupMutation.mutateAsync({
          id: targetId,
          data: draftPayload as UpdateStartupDto,
        });
      } else {
        const createResult = await createStartupMutation.mutateAsync({
          data: draftPayload as CreateStartupDto,
        });
        const created = unwrapApiResponse<{ id?: string }>(createResult);
        targetId = created?.id ?? null;
        if (targetId) {
          setStartupId(targetId);
        }
      }

      if (!targetId) {
        throw new Error("Failed to save draft: no startup id returned");
      }

      await registerPendingFilesToDataRoom(targetId, normalizedFiles);

      queryClient.invalidateQueries({ queryKey: ["/startups"] });
      toast.success("Draft saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save draft",
      );
    } finally {
      setIsSavingDraft(false);
    }
  };

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
              name="tagline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tagline</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="The one-line summary of your startup"
                      {...field}
                      data-testid="input-tagline"
                    />
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
                  <FormLabel>One-liner Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe what you do, who you serve, and why now (minimum 100 characters)"
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
                  <FormLabel>City / Location</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input className="pl-10" placeholder="City, Country (e.g., Dubai, UAE)" {...field} data-testid="input-location" />
                    </div>
                  </FormControl>
                  <FormDescription>
                    We map your city/location to Level 1-3 investor geographies automatically.
                  </FormDescription>
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
                  if (!isImageFileType(file.type)) {
                    throw new Error(
                      "Only image files are supported for product screenshots",
                    );
                  }

                  const uploadResult = await uploadUrlMutation.mutateAsync({
                    data: {
                      assetType: "images",
                      contentType: toSupportedContentType(file.type),
                    },
                  });
                  const uploadData = unwrapApiResponse<{
                    uploadUrl?: string;
                    publicUrl?: string;
                    key?: string;
                  }>(uploadResult);

                  if (!uploadData.uploadUrl) {
                    throw new Error("No upload url received from server");
                  }
                  screenshotPathMapRef.current[file.id] =
                    uploadData.publicUrl || uploadData.key || "";

                  return {
                    method: "PUT",
                    url: uploadData.uploadUrl,
                    headers: { "Content-Type": file.type },
                  };
                }}
                onComplete={(result) => {
                  if (result.successful && result.successful.length > 0) {
                    const newUrls = result.successful
                      .map(file => screenshotPathMapRef.current[file.id])
                      .filter(Boolean);
                    setProductScreenshots((prev) =>
                      Array.from(new Set([...prev, ...newUrls])),
                    );
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
              Upload pitch deck{isPitchDeckRequired ? " (required)" : ""} and supporting images (PDF and image files)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {uploadedFiles.length > 0 && (
              <div className="space-y-2 mb-4">
                {uploadedFiles.map((file, index) => {
                  const status = file.classificationStatus;
                  const agentLabels = formatAgentLabels(file.routedAgents);
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-4 p-3 rounded-lg bg-chart-2/10 border border-chart-2/20"
                      data-testid={`uploaded-file-${index}`}
                    >
                      <CheckCircle className="w-5 h-5 text-chart-2 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-medium truncate text-sm">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{file.type || "Document"}</p>
                        {(status === "pending" || status === "classifying") && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Classifying…
                          </p>
                        )}
                        {status === "completed" && file.classificationCategory && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <Badge variant="secondary" className="text-[11px]">
                              {formatCategoryLabel(file.classificationCategory)}
                            </Badge>
                            {agentLabels.length > 0 && (
                              <span className="text-[11px] text-muted-foreground">
                                → Used by {agentLabels.join(", ")}
                              </span>
                            )}
                          </div>
                        )}
                        {status === "failed" && (
                          <p className="text-xs text-destructive">
                            Classification failed: {file.classificationError ?? "unknown error"}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setUploadedFiles((prev) => {
                            const next = prev.filter((_, i) => i !== index);
                            if (deckPath === file.path) {
                              setDeckPath(getDefaultDeckPath(next));
                            }
                            return next;
                          });
                        }}
                        data-testid={`button-remove-file-${index}`}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <ObjectUploader
              maxNumberOfFiles={10}
              maxFileSize={52428800}
              onGetUploadParameters={async (file) => {
                if (
                  !SUPPORTED_DOCUMENT_TYPES.includes(
                    file.type as (typeof SUPPORTED_DOCUMENT_TYPES)[number],
                  )
                ) {
                  throw new Error(
                    "Only PDF, image, and Excel files are supported for startup uploads",
                  );
                }

                const uploadResult = await uploadUrlMutation.mutateAsync({
                  data: {
                    assetType: file.type.startsWith("image/")
                      ? "images"
                      : "transcripts",
                    contentType: toSupportedContentType(file.type),
                  },
                });
                const uploadData = unwrapApiResponse<{
                  uploadUrl?: string;
                  key?: string;
                  publicUrl?: string;
                }>(uploadResult);

                if (!uploadData.uploadUrl || !uploadData.key) {
                  throw new Error("No upload url received from server");
                }
                filePathMapRef.current[file.id] = uploadData.key;
                if (uploadData.publicUrl) {
                  filePublicUrlMapRef.current[file.id] = uploadData.publicUrl;
                }

                return {
                  method: "PUT",
                  url: uploadData.uploadUrl,
                  headers: { "Content-Type": file.type },
                };
              }}
              onComplete={(result) => {
                if (result.successful && result.successful.length > 0) {
                  const newFiles = result.successful
                    .map((file) => {
                      const storedPath = filePathMapRef.current[file.id];
                      return {
                        name: file.name,
                        path: storedPath || "",
                        type: file.type || "application/octet-stream",
                        publicUrl: filePublicUrlMapRef.current[file.id],
                      };
                    })
                    .filter((f) => f.path);
                  setUploadedFiles((prev) => {
                    const next = [...prev, ...newFiles];
                    setDeckPath((currentDeckPath) => {
                      if (
                        currentDeckPath &&
                        next.some(
                          (file) =>
                            file.path === currentDeckPath && isPdfFileType(file.type),
                        )
                      ) {
                        return currentDeckPath;
                      }

                      return getDefaultDeckPath(next);
                    });
                    return next;
                  });
                }
              }}
              buttonClassName="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploadedFiles.length > 0 ? 'Add More Files' : 'Upload Files'}
            </ObjectUploader>

            <p className="text-xs text-muted-foreground mt-2">
              Upload up to 10 files (PDF and image formats)
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

        {shouldShowPrimaryContactSection && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Primary Contact
              </CardTitle>
              <CardDescription>
                Your contact information for investor outreach ({primaryContactRequired ? "required" : "optional"})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name {primaryContactRequired ? "*" : ""}</FormLabel>
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
                    <FormLabel>Email Address {primaryContactRequired ? "*" : ""}</FormLabel>
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

        <div className="flex flex-col sm:flex-row gap-3">
          {shouldSaveDraft && (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={isSavingDraft || submitMutation.isPending}
              onClick={onSaveDraft}
              data-testid="button-save-draft"
            >
              {isSavingDraft ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving Draft...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save as Draft
                </>
              )}
            </Button>
          )}
          <Button
            type="submit"
            className="flex-1"
            disabled={submitMutation.isPending || isSavingDraft}
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
        </div>
      </form>
    </Form>
  );
}
