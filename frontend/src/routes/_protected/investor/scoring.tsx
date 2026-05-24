import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Filter, Info, Save, RotateCcw, Users, Target, Cpu, TrendingUp, DollarSign, Megaphone, PiggyBank, Shield, Scale as ScaleIcon, Handshake, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  UpdateScoringPreferencesDtoCustomWeights,
  UpdateScoringPreferencesDtoCustomRationale,
} from "@/api/generated/model";
import {
  useInvestorControllerGetScoringDefaults,
  useInvestorControllerGetScoringPreferences,
  useInvestorControllerGetThesis,
  useInvestorControllerCreateOrUpdateThesis,
  useInvestorControllerUpdateScoringPreference,
  getInvestorControllerGetThesisQueryKey,
  getInvestorControllerGetScoringPreferencesQueryKey,
  getInvestorControllerGetMatchesQueryKey,
  getInvestorControllerGetPipelineQueryKey,
} from "@/api/generated/investor/investor";
import { useToast } from "@/hooks/use-toast";
import type { FundingStage } from "@/types";

export const Route = createFileRoute("/_protected/investor/scoring")({
  component: InvestorScoringPage,
});

const stageLabels: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  series_d: "Series D",
  series_e: "Series E",
  series_f_plus: "Series F+",
  growth: "Growth",
};

const GROWTH_STAGE_ALIAS = "growth";
type DisplayStage = FundingStage | typeof GROWTH_STAGE_ALIAS;

function resolveStageKey(stage: string): string {
  return stage === GROWTH_STAGE_ALIAS ? "series_f_plus" : stage;
}

const WEIGHT_KEYS = [
  "team",
  "market",
  "product",
  "traction",
  "businessModel",
  "gtm",
  "financials",
  "competitiveAdvantage",
  "legal",
  "dealTerms",
  "exitPotential",
] as const;

const LENS_KEYS = ["teamLens", "marketLens", "tractionLens"] as const;
type LensKey = (typeof LENS_KEYS)[number];
type LensWeights = Record<LensKey, number>;

const lensLabels: Record<LensKey, string> = {
  teamLens: "Team",
  marketLens: "Market",
  tractionLens: "Traction",
};

const LENS_GROUPS: Record<LensKey, readonly (typeof WEIGHT_KEYS)[number][]> = {
  teamLens: ["team", "competitiveAdvantage", "legal", "dealTerms", "exitPotential"],
  marketLens: ["market", "product", "businessModel", "gtm"],
  tractionLens: ["traction", "financials"],
};

const CRITERION_SECTIONS: { id: (typeof WEIGHT_KEYS)[number]; label: string; icon: typeof Users; lens: LensKey }[] = [
  { id: "team", label: "Team", icon: Users, lens: "teamLens" },
  { id: "market", label: "Market", icon: Target, lens: "marketLens" },
  { id: "product", label: "Product", icon: Cpu, lens: "marketLens" },
  { id: "traction", label: "Traction", icon: TrendingUp, lens: "tractionLens" },
  { id: "businessModel", label: "Business Model", icon: DollarSign, lens: "marketLens" },
  { id: "gtm", label: "Go-to-Market", icon: Megaphone, lens: "marketLens" },
  { id: "financials", label: "Financials", icon: PiggyBank, lens: "tractionLens" },
  { id: "competitiveAdvantage", label: "Competitive Adv.", icon: Shield, lens: "teamLens" },
  { id: "legal", label: "Legal/Regulatory", icon: ScaleIcon, lens: "teamLens" },
  { id: "dealTerms", label: "Deal Terms", icon: Handshake, lens: "teamLens" },
  { id: "exitPotential", label: "Exit Potential", icon: LogOut, lens: "teamLens" },
];

function distributeIntegers(total: number, keys: readonly string[], ratios: number[]): Record<string, number> {
  if (keys.length === 0) return {};
  if (total <= 0) return Object.fromEntries(keys.map((key) => [key, 0]));

  const ratioSum = ratios.reduce((sum, ratio) => sum + Math.max(0, ratio), 0);
  const safeRatios = ratioSum > 0 ? ratios : keys.map(() => 1);
  const safeRatioSum = safeRatios.reduce((sum, ratio) => sum + ratio, 0);
  const allocations = keys.map((key, index) => {
    const raw = (total * safeRatios[index]) / safeRatioSum;
    return {
      key,
      floor: Math.floor(raw),
      remainder: raw - Math.floor(raw),
    };
  });

  let remaining = total - allocations.reduce((sum, item) => sum + item.floor, 0);
  allocations.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < allocations.length && remaining > 0; i += 1) {
    allocations[i].floor += 1;
    remaining -= 1;
  }

  return Object.fromEntries(allocations.map((item) => [item.key, item.floor]));
}

function toLensWeights(weights: Record<string, number> | null | undefined): LensWeights {
  return {
    teamLens: LENS_GROUPS.teamLens.reduce((sum, key) => sum + (weights?.[key] ?? 0), 0),
    marketLens: LENS_GROUPS.marketLens.reduce((sum, key) => sum + (weights?.[key] ?? 0), 0),
    tractionLens: LENS_GROUPS.tractionLens.reduce((sum, key) => sum + (weights?.[key] ?? 0), 0),
  };
}

function toCriterionWeights(lensWeights: LensWeights, baseWeights: Record<string, number>): UpdateScoringPreferencesDtoCustomWeights {
  const out: Record<string, number> = {};

  for (const lensKey of LENS_KEYS) {
    const keys = LENS_GROUPS[lensKey];
    const ratios = keys.map((key) => baseWeights[key] ?? 0);
    const distributed = distributeIntegers(lensWeights[lensKey], keys, ratios);
    Object.assign(out, distributed);
  }

  return Object.fromEntries(
    WEIGHT_KEYS.map((key) => [key, out[key] ?? 0]),
  ) as UpdateScoringPreferencesDtoCustomWeights;
}

type StageWeightEntry = {
  stage: string;
  weights: Record<string, number>;
  rationale: Record<string, string>;
  overallRationale?: string;
};
type ScoringPref = {
  stage: string;
  useCustomWeights: boolean;
  customWeights?: Record<string, number> | null;
  customRationale?: Record<string, string> | null;
};

type SavedCustomStageData = {
  customWeights: Record<string, number>;
};

const CUSTOM_STAGE_STORAGE_KEY = "investor-scoring-custom-cache:v1";

function readSavedCustomCache(): Record<string, SavedCustomStageData> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CUSTOM_STAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      SavedCustomStageData | { customWeights?: Record<string, number> }
    >;
    if (!parsed || typeof parsed !== "object") return {};

    const normalized: Record<string, SavedCustomStageData> = {};
    for (const [stage, value] of Object.entries(parsed)) {
      const weights =
        value && typeof value === "object" && "customWeights" in value
          ? value.customWeights
          : undefined;
      if (weights && typeof weights === "object") {
        normalized[resolveStageKey(stage)] = { customWeights: weights };
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function writeSavedCustomCache(cache: Record<string, SavedCustomStageData>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_STAGE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage failures; in-memory state still works for current session.
  }
}

function InvestorScoringPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeStage, setActiveStage] = useState<DisplayStage>("seed");
  const [minThesisFitScore, setMinThesisFitScore] = useState(0);
  const [minStartupScore, setMinStartupScore] = useState(0);
  const [thresholdsSaved, setThresholdsSaved] = useState(false);
  const [editingLensWeights, setEditingLensWeights] = useState<Record<string, LensWeights>>({});
  const [editingDetailWeights, setEditingDetailWeights] = useState<Record<string, Record<string, number>>>({});
  const [editingRationale, setEditingRationale] = useState<Record<string, Record<string, string>>>({});
  const [savedCustomByStage, setSavedCustomByStage] = useState<
    Record<string, SavedCustomStageData>
  >(() => readSavedCustomCache());

  const { data: defaultsResponse, isLoading: loadingDefaults, error: defaultsError } =
    useInvestorControllerGetScoringDefaults();
  const { data: prefsResponse, isLoading: loadingPrefs } =
    useInvestorControllerGetScoringPreferences();
  const { data: thesisResponse } = useInvestorControllerGetThesis();

  const createOrUpdateThesis = useInvestorControllerCreateOrUpdateThesis();
  const updateScoringPreference = useInvestorControllerUpdateScoringPreference();

  const thesis = Array.isArray(thesisResponse) ? null : thesisResponse;
  const thesisThresholds = thesis && "minThesisFitScore" in thesis ? thesis : null;

  const scoringWeights: StageWeightEntry[] =
    (Array.isArray(defaultsResponse)
      ? defaultsResponse
      : (defaultsResponse as { data?: StageWeightEntry[] })?.data) ?? [];
  const preferences: ScoringPref[] =
    (Array.isArray(prefsResponse)
      ? prefsResponse
      : (prefsResponse as { data?: ScoringPref[] })?.data) ?? [];

  const displayScoringWeights = useMemo(() => {
    const growthDefault = scoringWeights.find((sw) => sw.stage === "series_f_plus");
    if (!growthDefault || scoringWeights.some((sw) => sw.stage === GROWTH_STAGE_ALIAS)) {
      return scoringWeights;
    }

    return [
      ...scoringWeights,
      {
        ...growthDefault,
        stage: GROWTH_STAGE_ALIAS,
      },
    ];
  }, [scoringWeights]);

  const isLoading = loadingDefaults || loadingPrefs;

  const getEffectiveWeights = (stage: string): Record<string, number> | null => {
    const resolvedStage = resolveStageKey(stage);
    const pref = preferences.find((p) => p.stage === resolvedStage);
    if (pref?.useCustomWeights && pref.customWeights) {
      return pref.customWeights;
    }
    const defaults = displayScoringWeights.find((sw) => sw.stage === stage);
    return defaults?.weights ?? null;
  };

  const isCustomized = (stage: string): boolean => {
    const pref = preferences.find((p) => p.stage === resolveStageKey(stage));
    return pref?.useCustomWeights === true && pref?.customWeights != null;
  };

  const handleSaveThresholds = () => {
    createOrUpdateThesis.mutate(
      {
        data: {
          minThesisFitScore: minThesisFitScore || undefined,
          minStartupScore: minStartupScore || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getInvestorControllerGetThesisQueryKey() });
          queryClient.invalidateQueries({ queryKey: getInvestorControllerGetMatchesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getInvestorControllerGetPipelineQueryKey() });
          setThresholdsSaved(true);
          toast.success("Thresholds saved");
          setTimeout(() => setThresholdsSaved(false), 2000);
        },
      },
    );
  };

  const getEditingLensWeightsForStage = (stage: string): LensWeights => {
    const stageKey = resolveStageKey(stage);
    const effective = toLensWeights(getEffectiveWeights(stage));
    if (editingLensWeights[stageKey]) return editingLensWeights[stageKey];
    return effective;
  };

  const setLensWeightForStage = (stage: string, key: LensKey, value: number) => {
    const stageKey = resolveStageKey(stage);
    setEditingLensWeights((prev) => {
      const current = prev[stageKey] ?? getEditingLensWeightsForStage(stage);
      return {
        ...prev,
        [stageKey]: { ...current, [key]: Math.max(0, Math.min(100, value)) },
      };
    });
  };

  const getWeightsSum = (weights: Record<string, number>): number =>
    Object.values(weights).reduce((a, b) => a + b, 0);

  const getEditingDetailWeightsForStage = (stage: string): Record<string, number> => {
    const stageKey = resolveStageKey(stage);
    if (editingDetailWeights[stageKey]) return editingDetailWeights[stageKey];
    return getEffectiveWeights(stage) ?? {};
  };

  const setDetailWeightForStage = (stage: string, key: string, value: number) => {
    const stageKey = resolveStageKey(stage);
    const current = getEditingDetailWeightsForStage(stage);
    const updated = { ...current, [key]: Math.max(0, Math.min(100, value)) };
    setEditingDetailWeights((prev) => ({ ...prev, [stageKey]: updated }));
    // Sync lens weights from detail weights
    setEditingLensWeights((prev) => ({ ...prev, [stageKey]: toLensWeights(updated) }));
  };

  const getRationaleForStage = (stage: string): Record<string, string> => {
    const stageKey = resolveStageKey(stage);
    if (editingRationale[stageKey]) return editingRationale[stageKey];
    // Load from pref customRationale, fallback to platform defaults
    const pref = preferences.find((p) => p.stage === stageKey);
    const sw = displayScoringWeights.find((s) => s.stage === stage);
    const base = sw?.rationale ?? {};
    return { ...base, ...(pref?.customRationale ?? {}) };
  };

  const setRationaleForStage = (stage: string, key: string, value: string) => {
    const stageKey = resolveStageKey(stage);
    setEditingRationale((prev) => ({
      ...prev,
      [stageKey]: { ...getRationaleForStage(stage), [key]: value },
    }));
  };

  const handleResetToDefaults = (stage: string, section: "lens" | "detail") => {
    const stageKey = resolveStageKey(stage);
    const sw = displayScoringWeights.find((s) => s.stage === stage);
    if (!sw) return;

    if (section === "lens") {
      setEditingLensWeights((prev) => ({ ...prev, [stageKey]: toLensWeights(sw.weights) }));
      // Also reset detail weights to match default lens distribution
      setEditingDetailWeights((prev) => ({ ...prev, [stageKey]: { ...sw.weights } }));
    } else {
      setEditingDetailWeights((prev) => ({ ...prev, [stageKey]: { ...sw.weights } }));
      setEditingLensWeights((prev) => ({ ...prev, [stageKey]: toLensWeights(sw.weights) }));
    }

    // Reset rationale to platform defaults
    setEditingRationale((prev) => ({ ...prev, [stageKey]: { ...sw.rationale } }));

    // Save defaults back to server (disables custom weights)
    handleToggleCustomWeights(stage, false);
  };

  useEffect(() => {
    setSavedCustomByStage((prev) => {
      const next = { ...prev };
      for (const pref of preferences) {
        if (pref.customWeights) {
          next[pref.stage] = {
            customWeights: pref.customWeights,
          };
        }
      }
      return next;
    });
  }, [preferences]);

  useEffect(() => {
    writeSavedCustomCache(savedCustomByStage);
  }, [savedCustomByStage]);

  const handleSaveCustomWeights = (stage: string, source: "lens" | "detail" = "lens") => {
    const resolvedStage = resolveStageKey(stage);

    let fullWeights: UpdateScoringPreferencesDtoCustomWeights;
    if (source === "detail") {
      const detailWeights = getEditingDetailWeightsForStage(stage);
      const sum = WEIGHT_KEYS.reduce((s, k) => s + (detailWeights[k] ?? 0), 0);
      if (sum !== 100) return;
      fullWeights = Object.fromEntries(
        WEIGHT_KEYS.map((k) => [k, detailWeights[k] ?? 0]),
      ) as UpdateScoringPreferencesDtoCustomWeights;
    } else {
      const weights = getEditingLensWeightsForStage(stage);
      const sum = getWeightsSum(weights);
      if (sum !== 100) return;
      const baseWeights = getEditingDetailWeightsForStage(stage);
      fullWeights = toCriterionWeights(weights, baseWeights);
    }

    // Build customRationale from editing state
    const rationale = getRationaleForStage(stage);
    const sw = displayScoringWeights.find((s) => s.stage === stage);
    const platformRationale = sw?.rationale ?? {};
    // Only include customRationale if any value differs from platform default
    const hasCustomRationale = WEIGHT_KEYS.some(
      (k) => rationale[k] != null && rationale[k] !== (platformRationale[k] ?? ""),
    );
    const customRationale = hasCustomRationale
      ? (Object.fromEntries(
          WEIGHT_KEYS.map((k) => [k, rationale[k] ?? ""]),
        ) as UpdateScoringPreferencesDtoCustomRationale)
      : undefined;

    updateScoringPreference.mutate(
      {
        stage: resolvedStage,
        data: {
          useCustomWeights: true,
          customWeights: fullWeights,
          customRationale,
        },
      },
      {
        onSuccess: async () => {
          const queryKey = getInvestorControllerGetScoringPreferencesQueryKey();
          setSavedCustomByStage((prev) => ({
            ...prev,
            [resolvedStage]: {
              customWeights: fullWeights as Record<string, number>,
            },
          }));
          queryClient.setQueryData(queryKey, (old: unknown) => {
            const list = Array.isArray(old) ? old : (old as { data?: ScoringPref[] })?.data ?? [];
            const arr = [...(list as ScoringPref[])];
            const idx = arr.findIndex((p) => p.stage === resolvedStage);
            const updated: ScoringPref = {
              stage: resolvedStage,
              useCustomWeights: true,
              customWeights: fullWeights as Record<string, number>,
              customRationale: customRationale as Record<string, string> | undefined,
            };
            if (idx >= 0) arr[idx] = { ...arr[idx], ...updated };
            else arr.push(updated);
            return Array.isArray(old) ? arr : { ...(old as object), data: arr };
          });
          queryClient.invalidateQueries({ queryKey: getInvestorControllerGetMatchesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getInvestorControllerGetPipelineQueryKey() });
          const newLens = toLensWeights(fullWeights as Record<string, number>);
          setEditingLensWeights((prev) => ({ ...prev, [resolvedStage]: newLens }));
          setEditingDetailWeights((prev) => ({ ...prev, [resolvedStage]: fullWeights as Record<string, number> }));
          toast.info("Scores are being recalculated...", {
            description: "Your custom weights have been saved. Match scores will update shortly.",
          });
        },
      },
    );
  };

  const handleToggleCustomWeights = (stage: string, enabled: boolean) => {
    const resolvedStage = resolveStageKey(stage);
    const defaults = displayScoringWeights.find((sw) => sw.stage === stage);
    const pref = preferences.find((p) => p.stage === resolvedStage);

    if (enabled) {
      // Use saved custom values if they exist, otherwise use defaults
      const saved = savedCustomByStage[resolvedStage];
      const weights =
        saved?.customWeights ?? pref?.customWeights ?? defaults?.weights;
      if (!weights) return;

      updateScoringPreference.mutate(
        {
          stage: resolvedStage,
          data: {
            useCustomWeights: true,
            customWeights: weights as UpdateScoringPreferencesDtoCustomWeights,
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getInvestorControllerGetScoringPreferencesQueryKey(),
            });
            queryClient.invalidateQueries({ queryKey: getInvestorControllerGetMatchesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getInvestorControllerGetPipelineQueryKey() });
            toast.info("Scores are being recalculated...", {
              description: "Custom weights enabled. Match scores will update shortly.",
            });
          },
        },
      );
    } else {
      // Preserve current custom data when toggled off so it restores when toggled back on.
      const currentLensWeights = getEditingLensWeightsForStage(stage);
      const saved = savedCustomByStage[resolvedStage];
      const weightsToSave =
        Object.keys(currentLensWeights).length > 0 && getWeightsSum(currentLensWeights) === 100
          ? toCriterionWeights(currentLensWeights, getEffectiveWeights(stage) ?? {})
          : (saved?.customWeights ?? pref?.customWeights ?? null) as UpdateScoringPreferencesDtoCustomWeights | null;
      if (weightsToSave) {
        setSavedCustomByStage((prev) => ({
          ...prev,
          [resolvedStage]: {
            customWeights: weightsToSave as Record<string, number>,
          },
        }));
      }
      updateScoringPreference.mutate(
        {
          stage: resolvedStage,
          data: {
            useCustomWeights: false,
            customWeights: weightsToSave,
          },
        },
        {
          onSuccess: async () => {
            await queryClient.refetchQueries({
              queryKey: getInvestorControllerGetScoringPreferencesQueryKey(),
            });
            queryClient.invalidateQueries({ queryKey: getInvestorControllerGetMatchesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getInvestorControllerGetPipelineQueryKey() });
          },
        },
      );
    }
  };

  useEffect(() => {
    if (thesisThresholds && typeof thesisThresholds === "object") {
      const t = thesisThresholds as { minThesisFitScore?: number | null; minStartupScore?: number | null };
      if (t.minThesisFitScore != null) setMinThesisFitScore(t.minThesisFitScore);
      if (t.minStartupScore != null) setMinStartupScore(t.minStartupScore);
    }
  }, [thesisThresholds]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scoring Methodology</h1>
          <p className="text-muted-foreground">
            View default scoring weights and optionally customize them for your personal view
          </p>
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (defaultsError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scoring Methodology</h1>
          <p className="text-muted-foreground">
            View default scoring weights and optionally customize them for your personal view
          </p>
        </div>
        <div className="text-center py-12 text-destructive">
          Failed to load scoring weights: {(defaultsError as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scoring Methodology</h1>
        <p className="text-muted-foreground">
          Customize how startups are scored and matched to your investment thesis
        </p>
      </div>

      <Tabs value={activeStage} onValueChange={(v) => setActiveStage(v as DisplayStage)}>
        <TabsList>
          {displayScoringWeights.map((sw) => (
            <TabsTrigger key={sw.stage} value={sw.stage}>
              {stageLabels[sw.stage] || sw.stage}
              {isCustomized(sw.stage) && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                  Custom
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {displayScoringWeights.map((sw) => {
          const defaultLensWeights = toLensWeights(sw.weights);
          const lensWeightsForStage = getEditingLensWeightsForStage(sw.stage);
          const lensTotal = getWeightsSum(lensWeightsForStage);
          const detailWeightsForStage = getEditingDetailWeightsForStage(sw.stage);
          const detailTotal = WEIGHT_KEYS.reduce((s, k) => s + (detailWeightsForStage[k] ?? 0), 0);
          const rationaleForStage = getRationaleForStage(sw.stage);
          const customized = isCustomized(sw.stage);

          // Group criteria by lens for visual grouping
          const groupedCriteria = LENS_KEYS.map((lensKey) => ({
            lensKey,
            label: lensLabels[lensKey],
            criteria: CRITERION_SECTIONS.filter((c) => c.lens === lensKey),
          }));

          return (
            <TabsContent key={sw.stage} value={sw.stage} className="mt-6 space-y-6">
              {/* Stage Philosophy */}
              {sw.overallRationale && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary" />
                      <CardDescription className="text-sm">{sw.overallRationale}</CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              )}

              {/* Section 1: Screening Lens Weights */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Screening Lens Weights</CardTitle>
                      <CardDescription>
                        Controls how the 3 screening lenses (Team, Market, Traction) influence the overall screening score at this stage.
                      </CardDescription>
                    </div>
                    {customized && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground"
                        onClick={() => handleResetToDefaults(sw.stage, "lens")}
                        disabled={updateScoringPreference.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset to Defaults
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-3 px-4 font-medium text-sm w-44">Section</th>
                          <th className="text-left py-3 px-4 font-medium text-sm w-24">Weight</th>
                          <th className="text-left py-3 px-4 font-medium text-sm">Rationale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {LENS_KEYS.map((key) => {
                          const defaultVal = defaultLensWeights[key] ?? 0;
                          const editingVal = lensWeightsForStage[key] ?? defaultVal;
                          const lensRationale = LENS_GROUPS[key]
                            .map((ck) => rationaleForStage[ck] ?? "")
                            .filter(Boolean)
                            .join(" ");
                          const LensIcon = key === "teamLens" ? Users : key === "marketLens" ? Target : TrendingUp;
                          return (
                            <tr key={key} className="border-b last:border-0">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <LensIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                  {lensLabels[key]}
                                </div>
                                <Badge variant="outline" className="mt-1 ml-6 text-[10px] px-1.5 py-0 font-normal">
                                  Default {defaultVal}%
                                </Badge>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={editingVal}
                                    onChange={(e) => {
                                      const v = parseInt(e.target.value, 10);
                                      setLensWeightForStage(sw.stage, key, Number.isNaN(v) ? 0 : v);
                                    }}
                                    className="h-8 w-16 text-sm"
                                  />
                                  <span className="text-sm text-muted-foreground">%</span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <Input
                                  value={lensRationale}
                                  placeholder="Why this weight matters at this stage..."
                                  className="h-8 text-sm"
                                  onChange={(e) => {
                                    const primaryKey = LENS_GROUPS[key][0];
                                    setRationaleForStage(sw.stage, primaryKey, e.target.value);
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Total: {lensTotal}%
                      {lensTotal !== 100 && (
                        <span className="text-destructive ml-1">(must equal 100%)</span>
                      )}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleSaveCustomWeights(sw.stage, "lens")}
                      disabled={updateScoringPreference.isPending || lensTotal !== 100}
                      className="gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Lens Weights
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Section 2: Evaluation Criteria Weights */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Evaluation Criteria Weights</CardTitle>
                      <CardDescription>
                        Controls how the 11 DD evaluation dimensions are weighted. These map to the 3 screening lenses above.
                      </CardDescription>
                    </div>
                    {customized && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground"
                        onClick={() => handleResetToDefaults(sw.stage, "detail")}
                        disabled={updateScoringPreference.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset to Defaults
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-3 px-4 font-medium text-sm w-44">Criterion</th>
                          <th className="text-left py-3 px-4 font-medium text-sm w-24">Weight</th>
                          <th className="text-left py-3 px-4 font-medium text-sm">Rationale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedCriteria.map((group) => (
                          group.criteria.map((section, idx) => {
                            const Icon = section.icon;
                            const weight = detailWeightsForStage[section.id] ?? 0;
                            const rationale = rationaleForStage[section.id] ?? "";
                            return (
                              <tr
                                key={section.id}
                                className={
                                  idx === group.criteria.length - 1
                                    ? "border-b"
                                    : "border-b border-dashed"
                                }
                              >
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2 text-sm font-medium">
                                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                    {section.label}
                                  </div>
                                  <Badge variant="outline" className="mt-1 ml-6 text-[10px] px-1.5 py-0 font-normal">
                                    {lensLabels[section.lens]} lens
                                  </Badge>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={weight}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        if (Number.isNaN(v)) return;
                                        setDetailWeightForStage(sw.stage, section.id, v);
                                      }}
                                      className="h-8 w-16 text-sm"
                                    />
                                    <span className="text-sm text-muted-foreground">%</span>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <Input
                                    value={rationale}
                                    placeholder="Why this weight..."
                                    onChange={(e) => setRationaleForStage(sw.stage, section.id, e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </td>
                              </tr>
                            );
                          })
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Total: {detailTotal}%
                      {detailTotal !== 100 && (
                        <span className="text-destructive ml-1">(must equal 100%)</span>
                      )}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleSaveCustomWeights(sw.stage, "detail")}
                      disabled={updateScoringPreference.isPending || detailTotal !== 100}
                      className="gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Criteria Weights
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Section 3: Matching Thresholds */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Filter className="h-5 w-5 text-primary" />
                    <CardTitle>Matching Thresholds</CardTitle>
                  </div>
                  <CardDescription>
                    Only show startups that meet your minimum score requirements
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Minimum Thesis Fit Score</Label>
                      <span className="text-sm font-medium">{minThesisFitScore}%</span>
                    </div>
                    <Slider
                      value={[minThesisFitScore]}
                      onValueChange={([v]) => setMinThesisFitScore(v ?? 0)}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Only show matches with thesis fit at or above this score
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Minimum Startup Score</Label>
                      <span className="text-sm font-medium">{minStartupScore}%</span>
                    </div>
                    <Slider
                      value={[minStartupScore]}
                      onValueChange={([v]) => setMinStartupScore(v ?? 0)}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Only show startups with overall score at or above this score
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveThresholds}
                      disabled={createOrUpdateThesis.isPending}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {thresholdsSaved ? "Saved" : "Save Thresholds"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
