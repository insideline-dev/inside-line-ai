import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TwoLevelIndustrySelector } from "@/components/TwoLevelIndustrySelector";
import { CurrencyInput } from "@/components/CurrencyInput";
import { CountryCodeSelector } from "@/components/CountryCodeSelector";
import {
  useStartupControllerAdminUpdate,
  getStartupControllerFindOneQueryKey,
} from "@/api/generated/startup/startup";
import {
  getAdminControllerGetAllStartupsQueryKey,
  getAdminControllerGetStatsQueryKey,
} from "@/api/generated/admin/admin";
import {
  UpdateStartupDtoRaiseType,
  UpdateStartupDtoStage,
  UpdateStartupDtoValuationType,
  type UpdateStartupDto,
} from "@/api/generated/model";
import type { Startup } from "@/types/startup";

type AdminEditFormValues = {
  name: string;
  website?: string;
  description?: string;
  stage?: string;
  industry?: string;
  location?: string;
  sectorIndustryGroup?: string;
  sectorIndustry?: string;
  fundingTarget?: string;
  roundCurrency: string;
  valuationKnown: boolean;
  valuation?: string;
  valuationType?: string;
  raiseType?: string;
  leadSecured: boolean;
  leadInvestorName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhoneCountryCode?: string;
  contactPhone?: string;
  hasPreviousFunding: boolean;
  previousFundingAmount?: string;
  previousFundingCurrency: string;
  previousInvestors?: string;
  previousRoundType?: string;
};

interface AdminEditTabProps {
  startup: Startup;
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

function numberToInput(value?: number | null): string {
  if (value == null) return "";
  return String(value);
}

function toFormValues(startup: Startup): AdminEditFormValues {
  return {
    name: startup.name ?? "",
    website: startup.website ?? "",
    description: startup.description ?? "",
    stage: startup.stage ?? "",
    industry: startup.industry ?? "",
    location: startup.location ?? "",
    sectorIndustryGroup: startup.sectorIndustryGroup ?? "",
    sectorIndustry: startup.sectorIndustry ?? "",
    fundingTarget: numberToInput(startup.fundingTarget),
    roundCurrency: startup.roundCurrency ?? "USD",
    valuationKnown: startup.valuationKnown ?? true,
    valuation: numberToInput(startup.valuation),
    valuationType: startup.valuationType ?? "post_money",
    raiseType: startup.raiseType ?? "",
    leadSecured: startup.leadSecured ?? false,
    leadInvestorName: startup.leadInvestorName ?? "",
    contactName: startup.contactName ?? "",
    contactEmail: startup.contactEmail ?? "",
    contactPhoneCountryCode: startup.contactPhoneCountryCode ?? "US",
    contactPhone: startup.contactPhone ?? "",
    hasPreviousFunding: startup.hasPreviousFunding ?? false,
    previousFundingAmount: numberToInput(startup.previousFundingAmount),
    previousFundingCurrency: startup.previousFundingCurrency ?? "USD",
    previousInvestors: startup.previousInvestors ?? "",
    previousRoundType: startup.previousRoundType ?? "",
  };
}

function formatStatus(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AdminEditTab({ startup }: AdminEditTabProps) {
  const queryClient = useQueryClient();
  const form = useForm<AdminEditFormValues>({
    defaultValues: toFormValues(startup),
  });

  useEffect(() => {
    form.reset(toFormValues(startup));
  }, [form, startup]);

  const valuationKnown = form.watch("valuationKnown");
  const leadSecured = form.watch("leadSecured");
  const hasPreviousFunding = form.watch("hasPreviousFunding");

  const updateMutation = useStartupControllerAdminUpdate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getStartupControllerFindOneQueryKey(startup.id),
        });
        queryClient.invalidateQueries({
          queryKey: getAdminControllerGetAllStartupsQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getAdminControllerGetStatsQueryKey(),
        });
        toast.success("Startup details updated");
      },
      onError: (error: Error) => {
        toast.error("Failed to update startup", { description: error.message });
      },
    },
  });

  const onSubmit = (values: AdminEditFormValues) => {
    if (!values.name.trim()) {
      form.setError("name", { message: "Company name is required" });
      return;
    }

    const valuationKnownValue = values.valuationKnown;
    const hasPreviousFundingValue = values.hasPreviousFunding;
    const leadSecuredValue = values.leadSecured;

    const payload: UpdateStartupDto = {
      name: values.name.trim(),
      website: normalizeOptionalText(values.website),
      description: normalizeOptionalText(values.description),
      stage: values.stage
        ? (values.stage as (typeof UpdateStartupDtoStage)[keyof typeof UpdateStartupDtoStage])
        : undefined,
      industry:
        normalizeOptionalText(values.industry) ||
        normalizeOptionalText(values.sectorIndustry) ||
        normalizeOptionalText(values.sectorIndustryGroup),
      location: normalizeOptionalText(values.location),
      sectorIndustryGroup: normalizeOptionalText(values.sectorIndustryGroup),
      sectorIndustry: normalizeOptionalText(values.sectorIndustry),
      fundingTarget: parsePositiveNumberInput(values.fundingTarget),
      roundCurrency: normalizeOptionalText(values.roundCurrency) || "USD",
      valuationKnown: valuationKnownValue,
      valuation: valuationKnownValue
        ? parsePositiveNumberInput(values.valuation)
        : undefined,
      valuationType:
        valuationKnownValue && values.valuationType
          ? (values.valuationType as (typeof UpdateStartupDtoValuationType)[keyof typeof UpdateStartupDtoValuationType])
          : undefined,
      raiseType: values.raiseType
        ? (values.raiseType as (typeof UpdateStartupDtoRaiseType)[keyof typeof UpdateStartupDtoRaiseType])
        : undefined,
      leadSecured: leadSecuredValue,
      leadInvestorName: leadSecuredValue
        ? normalizeOptionalText(values.leadInvestorName)
        : undefined,
      contactName: normalizeOptionalText(values.contactName),
      contactEmail: normalizeOptionalText(values.contactEmail),
      contactPhoneCountryCode: normalizeOptionalText(values.contactPhoneCountryCode),
      contactPhone: normalizeOptionalText(values.contactPhone),
      hasPreviousFunding: hasPreviousFundingValue,
      previousFundingAmount: hasPreviousFundingValue
        ? parsePositiveNumberInput(values.previousFundingAmount)
        : undefined,
      previousFundingCurrency: hasPreviousFundingValue
        ? normalizeOptionalText(values.previousFundingCurrency) || "USD"
        : undefined,
      previousInvestors: hasPreviousFundingValue
        ? normalizeOptionalText(values.previousInvestors)
        : undefined,
      previousRoundType: hasPreviousFundingValue
        ? normalizeOptionalText(values.previousRoundType)
        : undefined,
    };

    updateMutation.mutate({
      id: startup.id,
      data: payload,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <PencilLine className="h-5 w-5" />
          Edit Startup Details
        </CardTitle>
        <CardDescription>
          Modify startup information as an administrator
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                      <Input {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea className="min-h-24" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stage</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={UpdateStartupDtoStage.pre_seed}>Pre-seed</SelectItem>
                        <SelectItem value={UpdateStartupDtoStage.seed}>Seed</SelectItem>
                        <SelectItem value={UpdateStartupDtoStage.series_a}>Series A</SelectItem>
                        <SelectItem value={UpdateStartupDtoStage.series_b}>Series B</SelectItem>
                        <SelectItem value={UpdateStartupDtoStage.series_c}>Series C</SelectItem>
                        <SelectItem value={UpdateStartupDtoStage.series_d}>Series D</SelectItem>
                        <SelectItem value={UpdateStartupDtoStage.series_e}>Series E</SelectItem>
                        <SelectItem value={UpdateStartupDtoStage.series_f_plus}>Series F+</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="industry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sector</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="Select sector" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <FormLabel>Status</FormLabel>
              <Input value={formatStatus(startup.status)} readOnly disabled />
            </div>

            <TwoLevelIndustrySelector
              groupValue={form.watch("sectorIndustryGroup")}
              industryValue={form.watch("sectorIndustry")}
              onGroupChange={(group) => form.setValue("sectorIndustryGroup", group)}
              onIndustryChange={(industry) => form.setValue("sectorIndustry", industry)}
            />

            <div className="grid gap-4 md:grid-cols-2">
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
                        onValueChange={field.onChange}
                        showCurrencySelector={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="roundCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || "USD"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                        <SelectItem value="GBP">GBP - British Pound</SelectItem>
                        <SelectItem value="MAD">MAD - Moroccan Dirham</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="valuationKnown"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="mb-0">Target Valuation Known</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {valuationKnown && (
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="valuation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Valuation</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value || ""}
                          currency={form.watch("roundCurrency") || "USD"}
                          onValueChange={field.onChange}
                          showCurrencySelector={false}
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
                      <FormLabel>Valuation Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select valuation type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={UpdateStartupDtoValuationType.pre_money}>
                            Pre-money
                          </SelectItem>
                          <SelectItem value={UpdateStartupDtoValuationType.post_money}>
                            Post-money
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="raiseType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raise Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select raise type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={UpdateStartupDtoRaiseType.safe}>SAFE</SelectItem>
                      <SelectItem value={UpdateStartupDtoRaiseType.convertible_note}>
                        Convertible Note
                      </SelectItem>
                      <SelectItem value={UpdateStartupDtoRaiseType.equity}>Equity</SelectItem>
                      <SelectItem value={UpdateStartupDtoRaiseType.safe_equity}>
                        SAFE + Equity
                      </SelectItem>
                      <SelectItem value={UpdateStartupDtoRaiseType.undecided}>
                        Undecided
                      </SelectItem>
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
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="mb-0">Lead Investor Secured</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
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
                    <FormLabel>Lead Investor</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="space-y-3">
              <p className="text-sm font-medium">Contact Information</p>
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Name</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
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
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel>Contact Phone</FormLabel>
                  <div className="flex gap-2">
                    <CountryCodeSelector
                      value={form.watch("contactPhoneCountryCode") || "US"}
                      onValueChange={(value) =>
                        form.setValue("contactPhoneCountryCode", value)
                      }
                    />
                    <FormField
                      control={form.control}
                      name="contactPhone"
                      render={({ field }) => (
                        <FormControl>
                          <Input
                            className="flex-1"
                            {...field}
                            value={field.value || ""}
                            placeholder="Phone number"
                          />
                        </FormControl>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="hasPreviousFunding"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="mb-0">Has Previous Funding</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {hasPreviousFunding && (
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="previousFundingAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Previous Funding Amount</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value || ""}
                          currency={form.watch("previousFundingCurrency") || "USD"}
                          onValueChange={field.onChange}
                          onCurrencyChange={(currency) =>
                            form.setValue("previousFundingCurrency", currency)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="previousRoundType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Previous Round Type</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="previousInvestors"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Previous Investors</FormLabel>
                      <FormControl>
                        <Textarea className="min-h-20" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
