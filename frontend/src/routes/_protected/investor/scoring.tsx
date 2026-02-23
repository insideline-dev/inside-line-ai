import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Filter, Info, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  UpdateScoringPreferencesDtoCustomWeights,
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
};

const weightLabels: Record<string, string> = {
  team: "Team",
  market: "Market",
  product: "Product",
  traction: "Traction",
  businessModel: "Business Model",
  gtm: "GTM Strategy",
  financials: "Financials",
  competitiveAdvantage: "Competitive Advantage",
  legal: "Legal",
  dealTerms: "Deal Terms",
  exitPotential: "Exit Potential",
};

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
        normalized[stage] = { customWeights: weights };
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
  const [activeStage, setActiveStage] = useState<FundingStage>("seed");
  const [minThesisFitScore, setMinThesisFitScore] = useState(0);
  const [minStartupScore, setMinStartupScore] = useState(0);
  const [thresholdsSaved, setThresholdsSaved] = useState(false);
  const [editingWeights, setEditingWeights] = useState<Record<string, Record<string, number>>>({});
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

  const isLoading = loadingDefaults || loadingPrefs;

  const getEffectiveWeights = (stage: string): Record<string, number> | null => {
    const pref = preferences.find((p) => p.stage === stage);
    if (pref?.useCustomWeights && pref.customWeights) {
      return pref.customWeights;
    }
    const defaults = scoringWeights.find((sw) => sw.stage === stage);
    return defaults?.weights ?? null;
  };

  const isCustomized = (stage: string): boolean => {
    const pref = preferences.find((p) => p.stage === stage);
    return pref?.useCustomWeights === true && pref?.customWeights != null;
  };

  const getUseCustomWeights = (stage: string): boolean => {
    const pref = preferences.find((p) => p.stage === stage);
    return pref?.useCustomWeights === true;
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
          setTimeout(() => setThresholdsSaved(false), 2000);
        },
      },
    );
  };

  const getEditingWeightsForStage = (stage: string): Record<string, number> => {
    const effective = getEffectiveWeights(stage);
    if (editingWeights[stage]) return editingWeights[stage];
    return effective ?? {};
  };

  const setWeightForStage = (stage: string, key: string, value: number) => {
    setEditingWeights((prev) => {
      const current = prev[stage] ?? getEffectiveWeights(stage) ?? {};
      return {
        ...prev,
        [stage]: { ...current, [key]: Math.max(0, Math.min(100, value)) },
      };
    });
  };

  const getWeightsSum = (weights: Record<string, number>): number =>
    Object.values(weights).reduce((a, b) => a + b, 0);

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

  const handleSaveCustomWeights = (stage: string) => {
    const weights = getEditingWeightsForStage(stage);
    const sum = getWeightsSum(weights);
    if (sum !== 100) return;
    const fullWeights = Object.fromEntries(
      WEIGHT_KEYS.map((k) => [k, weights[k] ?? 0]),
    ) as UpdateScoringPreferencesDtoCustomWeights;
    updateScoringPreference.mutate(
      {
        stage,
        data: {
          useCustomWeights: true,
          customWeights: fullWeights,
        },
      },
      {
        onSuccess: async () => {
          const queryKey = getInvestorControllerGetScoringPreferencesQueryKey();
          setSavedCustomByStage((prev) => ({
            ...prev,
            [stage]: {
              customWeights: fullWeights as Record<string, number>,
            },
          }));
          // Update cache immediately so Scoring Weights + Weight Rationale cards show saved data
          queryClient.setQueryData(queryKey, (old: unknown) => {
            const list = Array.isArray(old) ? old : (old as { data?: ScoringPref[] })?.data ?? [];
            const arr = [...(list as ScoringPref[])];
            const idx = arr.findIndex((p) => p.stage === stage);
            const updated: ScoringPref = {
              stage,
              useCustomWeights: true,
              customWeights: fullWeights as Record<string, number>,
            };
            if (idx >= 0) arr[idx] = { ...arr[idx], ...updated };
            else arr.push(updated);
            return Array.isArray(old) ? arr : { ...(old as object), data: arr };
          });
          await queryClient.refetchQueries({ queryKey });
          queryClient.invalidateQueries({ queryKey: getInvestorControllerGetMatchesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getInvestorControllerGetPipelineQueryKey() });
          setEditingWeights((prev) => ({ ...prev, [stage]: fullWeights as Record<string, number> }));
          toast.info("Scores are being recalculated...", {
            description: "Your custom weights have been saved. Match scores will update shortly.",
          });
        },
      },
    );
  };

  const handleToggleCustomWeights = (stage: string, enabled: boolean) => {
    const defaults = scoringWeights.find((sw) => sw.stage === stage);
    const pref = preferences.find((p) => p.stage === stage);

    if (enabled) {
      // Use saved custom values if they exist, otherwise use defaults
      const persisted = readSavedCustomCache();
      const saved = savedCustomByStage[stage] ?? persisted[stage];
      const weights =
        saved?.customWeights ?? pref?.customWeights ?? defaults?.weights;
      if (!weights) return;

      updateScoringPreference.mutate(
        {
          stage,
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
      const currentWeights = getEditingWeightsForStage(stage);
      const persisted = readSavedCustomCache();
      const saved = savedCustomByStage[stage] ?? persisted[stage];
      const weightsToSave =
        Object.keys(currentWeights).length > 0 && getWeightsSum(currentWeights) === 100
          ? (Object.fromEntries(
              WEIGHT_KEYS.map((k) => [k, currentWeights[k] ?? 0]),
            ) as UpdateScoringPreferencesDtoCustomWeights)
          : (saved?.customWeights ?? pref?.customWeights ?? null) as UpdateScoringPreferencesDtoCustomWeights | null;
      if (weightsToSave) {
        setSavedCustomByStage((prev) => ({
          ...prev,
          [stage]: {
            customWeights: weightsToSave as Record<string, number>,
          },
        }));
      }
      updateScoringPreference.mutate(
        {
          stage,
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
          View default scoring weights and optionally customize them for your personal view
        </p>
      </div>

      {/* Matching Thresholds */}
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

      {/* How Custom Scoring Works */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            <CardTitle>How Custom Scoring Works</CardTitle>
          </div>
          <CardDescription>
            When you enable custom weights, startups will be re-scored using your weights in your
            view.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeStage} onValueChange={(v) => setActiveStage(v as FundingStage)}>
        <TabsList>
          {scoringWeights.map((sw) => (
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

        {scoringWeights.map((sw) => {
          const effective = getEffectiveWeights(sw.stage);
          const customized = isCustomized(sw.stage);
          const useCustomWeights = getUseCustomWeights(sw.stage);

          return (
            <TabsContent key={sw.stage} value={sw.stage} className="mt-6 space-y-6">
              {/* Stage Philosophy */}
              {sw.overallRationale && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Info className="h-5 w-5 text-primary" />
                      <CardTitle>Stage Philosophy</CardTitle>
                    </div>
                    <CardDescription>{sw.overallRationale}</CardDescription>
                  </CardHeader>
                </Card>
              )}

              {/* Use Custom Weights */}
              <Card>
                <CardHeader>
                  <CardTitle>Use Custom Weights</CardTitle>
                  <CardDescription>
                    {useCustomWeights
                      ? "Using your custom weights"
                      : "Using default platform weights"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`custom-weights-${sw.stage}`}
                          checked={useCustomWeights}
                          onCheckedChange={(checked) =>
                            handleToggleCustomWeights(sw.stage, checked)
                          }
                          disabled={updateScoringPreference.isPending}
                        />
                        <Label htmlFor={`custom-weights-${sw.stage}`} className="font-medium">
                          Use Custom Weights
                        </Label>
                      </div>
                    </div>
                    {useCustomWeights && (
                      <Button
                        onClick={() => handleSaveCustomWeights(sw.stage)}
                        disabled={
                          updateScoringPreference.isPending ||
                          getWeightsSum(getEditingWeightsForStage(sw.stage)) !== 100
                        }
                        className="gap-2 shrink-0"
                      >
                        <Save className="h-4 w-4" />
                        Save
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Weight editor - shown when custom weights enabled */}
              {useCustomWeights && (
                <Card>
                  <CardHeader>
                    <CardTitle>Customize Weights</CardTitle>
                    <CardDescription>
                      Adjust weights for each criterion. Total must equal 100%.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left py-3 px-4 font-medium align-top w-32">
                              Criterion
                            </th>
                            <th className="text-left py-3 px-4 font-medium align-top w-20">
                              Default
                            </th>
                            <th className="text-left py-3 px-4 font-medium align-top w-28">
                              Your Weight
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {WEIGHT_KEYS.map((key) => {
                            const defaultVal = sw.weights[key] ?? 0;
                            const editingVal =
                              getEditingWeightsForStage(sw.stage)[key] ?? defaultVal;
                            return (
                              <tr key={key} className="border-b last:border-0">
                                <td className="py-3 px-4 text-sm font-medium align-top">
                                  {weightLabels[key] || key}
                                </td>
                                <td className="py-3 px-4 align-top">
                                  <Badge variant="secondary" className="font-normal">
                                    {defaultVal}%
                                  </Badge>
                                </td>
                                <td className="py-3 px-4 align-top">
                                  <div className="flex items-center gap-1 w-20">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={editingVal}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        setWeightForStage(
                                          sw.stage,
                                          key,
                                          Number.isNaN(v) ? 0 : v,
                                        );
                                      }}
                                      className="h-9 text-sm"
                                    />
                                    <span className="text-sm text-muted-foreground">%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Total: {getWeightsSum(getEditingWeightsForStage(sw.stage))}%
                      {getWeightsSum(getEditingWeightsForStage(sw.stage)) !== 100 && (
                        <span className="text-destructive ml-1"> (must equal 100%)</span>
                      )}
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle>Scoring Weights</CardTitle>
                      {customized && <Badge variant="outline">Custom</Badge>}
                    </div>
                    <CardDescription>
                      {customized
                        ? "You have custom weights for this stage"
                        : sw.overallRationale || "Platform default weights"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {effective &&
                      WEIGHT_KEYS.map((key) => {
                        const value = effective[key] ?? 0;
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>{weightLabels[key] || key}</span>
                              <span className="font-medium">{value}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${value}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle>
                        {useCustomWeights && preferences.find((p) => p.stage === sw.stage)?.customRationale
                          ? "Weight Rationale"
                          : "Platform Rationale"}
                      </CardTitle>
                      <Badge variant={useCustomWeights && preferences.find((p) => p.stage === sw.stage)?.customRationale ? "default" : "secondary"}>
                        {useCustomWeights && preferences.find((p) => p.stage === sw.stage)?.customRationale
                          ? "Custom"
                          : "Platform Default"}
                      </Badge>
                    </div>
                    <CardDescription>Why these weights matter at this stage</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {WEIGHT_KEYS.map((key) => {
                      const pref = preferences.find((p) => p.stage === sw.stage);
                      const customRationale = useCustomWeights ? pref?.customRationale : null;
                      const value = customRationale?.[key] ?? sw.rationale[key] ?? "";
                      return (
                        <div key={key} className="space-y-1">
                          <h4 className="font-medium text-sm">{weightLabels[key] || key}</h4>
                          <p className="text-sm text-muted-foreground">{value || "—"}</p>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
