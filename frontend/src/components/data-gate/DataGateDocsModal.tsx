import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, Sparkles, MessageSquare, Loader2, Upload, HelpCircle, Mail } from "lucide-react";
import { ApiError } from "@/api/client";
import { unwrapApiResponse } from "@/lib/api-utils";
import type { DataGateInfoDto } from "@/api/generated/model";
import { env } from "@/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useStartupControllerGetDataGates,
  useStartupControllerSkipDataGate,
  useStartupControllerRequestDocuments,
  getStartupControllerFindAllQueryKey,
} from "@/api/generated/startups/startups";
import { getInvestorControllerGetPipelineQueryKey } from "@/api/generated/investor/investor";
import { getAdminControllerGetAllStartupsQueryKey } from "@/api/generated/admin/admin";
import { useToast } from "@/hooks/use-toast";

export const DOC_TYPE_LABELS: Record<string, string> = {
  pitch_deck: "Pitch Deck",
  financial: "Financials",
  cap_table: "Cap Table",
  legal: "Legal Documents",
  technical_product: "Technical / Product",
  business_plan: "Business Plan",
  market_research: "Market Research",
  contract: "Contracts",
  team_hr: "Team / HR",
};

const UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx," +
  "application/pdf," +
  "application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-powerpoint," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

// Trusted manual upload: stores the file under the chosen `category` with
// classificationStatus=completed (no AI re-classification), so the data gate
// reflects it immediately. The generated Orval hook serializes the body as
// JSON and cannot carry a file, so we use a multipart FormData fetch here.
async function uploadTrustedDoc(startupId: string, file: File, category: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  formData.append("trustCategory", "true");

  const response = await fetch(
    `${env.VITE_API_BASE_URL}/startups/${startupId}/data-room`,
    { method: "POST", body: formData, credentials: "include" },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error.message || "Upload failed");
  }
}

export function DataGateDocsModal({
  startupId,
  displayName,
  open,
  onOpenChange,
  isTabActive,
}: {
  startupId: string;
  displayName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  isTabActive?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [founderEmail, setFounderEmail] = useState("");
  // When an email is already on file, the investor can opt to override it.
  const [overridingEmail, setOverridingEmail] = useState(false);

  const { data: gateResponse } = useStartupControllerGetDataGates(startupId, {
    query: {
      enabled: open || !!isTabActive,
      staleTime: 30_000,
    },
  });
  // `customFetch` returns the raw body (no `{ data }` envelope), so unwrap
  // defensively rather than reading `gateResponse.data` (undefined at runtime).
  const gateData = unwrapApiResponse<DataGateInfoDto | undefined>(gateResponse);

  const invalidateDataGates = () =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        query.queryKey[0].startsWith("/startups/") &&
        query.queryKey[0].endsWith("/data-gates"),
    });

  // Tracks which doc type is mid-upload so we can show a per-row spinner.
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTypeRef = useRef<string | null>(null);

  const triggerUpload = (docType: string) => {
    if (uploadingType) return;
    pendingTypeRef.current = docType;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    const docType = pendingTypeRef.current;
    e.target.value = ""; // allow re-selecting the same file later
    pendingTypeRef.current = null;
    if (!file || !docType) return;

    setUploadingType(docType);
    try {
      await uploadTrustedDoc(startupId, file, docType);
      await Promise.all([
        invalidateDataGates(),
        queryClient.invalidateQueries({ queryKey: ["data-room", startupId] }),
      ]);
      toast.success(
        `${DOC_TYPE_LABELS[docType] ?? docType} uploaded`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Upload failed",
      );
    } finally {
      setUploadingType(null);
    }
  };

  const skipMutation = useStartupControllerSkipDataGate({
    mutation: {
      onSuccess: () => {
        toast.success("Data gate skipped — DD pipeline starting");
        queryClient.invalidateQueries({ queryKey: getInvestorControllerGetPipelineQueryKey() });
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindAllQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllStartupsQueryKey() });
        void invalidateDataGates();
      },
      onError: () => {
        toast.error("Failed to skip data gate");
      },
    },
  });

  const requestDocsMutation = useStartupControllerRequestDocuments({
    mutation: {
      onSuccess: (response) => {
        // `customFetch` returns the raw body, so read it via unwrapApiResponse
        // rather than `response.data` (which is undefined at runtime).
        const result = unwrapApiResponse<{ sentTo?: string | null }>(response);
        if (result.sentTo) {
          toast.success(`Document request sent to ${result.sentTo}`);
        }
        setFounderEmail("");
        setOverridingEmail(false);
        void invalidateDataGates();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 400 && error.message.includes("founder email")) {
          toast.error("No founder email found — please enter one below");
        } else {
          toast.error("Failed to send document request");
        }
      },
    },
  });

  const handleRequestDocs = (email?: string) => {
    requestDocsMutation.mutate({
      id: startupId,
      data: email ? { founderEmail: email } : {},
    });
  };

  const isSkipping = skipMutation.isPending;
  const isRequesting = requestDocsMutation.isPending;
  const alreadyRequested = Boolean(gateData?.docRequestedAt);
  // The recipient must be typed in when nothing is on file, or when the
  // investor has chosen to override the on-file address.
  const needsTypedEmail = !gateData?.founderEmail || overridingEmail;

  // Three document buckets: what we have, what's required but missing, and
  // what's recommended to round out the data room.
  const presentDocs = gateData?.presentDocTypes ?? [];
  const missingDocs = gateData?.missingMaterials ?? [];
  const recommendedDocs = Object.keys(DOC_TYPE_LABELS).filter(
    (t) => !presentDocs.includes(t) && !missingDocs.includes(t),
  );
  const openQuestions = (gateData?.openQuestions ?? []).filter(
    (q) => q.status === "open",
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Reset transient email state when the modal closes.
        if (!o) {
          setOverridingEmail(false);
          setFounderEmail("");
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{displayName} — Data Room</DialogTitle>
          <DialogDescription>
            What we have on file, what's still required, and what's recommended
            before due diligence.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="hidden"
          onChange={handleFileSelected}
        />

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Available with us
            </p>
            {presentDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents on file yet.</p>
            ) : (
              presentDocs.map((t) => (
                <div key={t} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-green-600" />
                  <span>{DOC_TYPE_LABELS[t] ?? t.replace(/_/g, " ")}</span>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Missing — required
            </p>
            {missingDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing required is missing.</p>
            ) : (
              missingDocs.map((t) => (
                <div key={t} className="flex items-center gap-2 text-sm">
                  <X className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="flex-1 text-foreground">
                    {DOC_TYPE_LABELS[t] ?? t.replace(/_/g, " ")}
                  </span>
                  <RowUploadButton
                    docType={t}
                    uploading={uploadingType === t}
                    disabled={uploadingType !== null && uploadingType !== t}
                    onUpload={triggerUpload}
                  />
                </div>
              ))
            )}
          </div>

          {recommendedDocs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recommended
              </p>
              {recommendedDocs.map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Sparkles className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="flex-1">
                    {DOC_TYPE_LABELS[t] ?? t.replace(/_/g, " ")}
                  </span>
                  <RowUploadButton
                    docType={t}
                    uploading={uploadingType === t}
                    disabled={uploadingType !== null && uploadingType !== t}
                    onUpload={triggerUpload}
                  />
                </div>
              ))}
            </div>
          )}

          {openQuestions.length > 0 && (
            <div className="space-y-1.5 border-t pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Open questions &amp; issues
              </p>
              {openQuestions.map((q) => (
                <div key={q.id} className="flex items-start gap-2 text-sm">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span className="text-foreground">{q.summary}</span>
                </div>
              ))}
            </div>
          )}

          {gateData?.founderEmail && !overridingEmail ? (
            <div className="flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">
                Clara will email:{" "}
                <span className="font-medium text-foreground">
                  {gateData.founderEmail}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setFounderEmail(gateData.founderEmail ?? "");
                  setOverridingEmail(true);
                }}
                className="font-medium text-primary hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {gateData?.founderEmail
                    ? "Send to a different email instead."
                    : "No founder email on file — enter one so Clara can reach out."}
                </span>
              </div>
              <Input
                type="email"
                placeholder="founder@company.com"
                value={founderEmail}
                onChange={(e) => setFounderEmail(e.target.value)}
                className="h-8 text-sm"
              />
              {gateData?.founderEmail && (
                <button
                  type="button"
                  onClick={() => {
                    setOverridingEmail(false);
                    setFounderEmail("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Use {gateData.founderEmail} instead
                </button>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => skipMutation.mutate({ id: startupId })}
            disabled={isSkipping}
          >
            {isSkipping ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Skip to Analysis
          </Button>
          <Button
            size="sm"
            disabled={
              isRequesting ||
              // When no email is on file (or the investor is overriding it),
              // require a valid one to be typed in first.
              (needsTypedEmail && !founderEmail.trim()) ||
              // Already-requested locks the button — unless the investor is
              // overriding the recipient, which is an intentional re-send.
              (alreadyRequested && !overridingEmail)
            }
            onClick={() =>
              handleRequestDocs(needsTypedEmail ? founderEmail.trim() : undefined)
            }
          >
            {isRequesting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            )}
            {alreadyRequested && !overridingEmail
              ? "Requested"
              : overridingEmail
                ? "Send to this email"
                : "Request via Clara"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowUploadButton({
  docType,
  uploading,
  disabled,
  onUpload,
}: {
  docType: string;
  uploading: boolean;
  disabled: boolean;
  onUpload: (docType: string) => void;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs"
      disabled={uploading || disabled}
      onClick={() => onUpload(docType)}
    >
      {uploading ? (
        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Upload className="mr-1 h-3.5 w-3.5" />
      )}
      Upload
    </Button>
  );
}
