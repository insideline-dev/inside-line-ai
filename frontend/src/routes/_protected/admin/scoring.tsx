import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  useAdminControllerGetAllScoringWeights,
  useAdminControllerUpdateScoringWeightsByStage,
  useAdminControllerSeedScoringWeights,
  getAdminControllerGetAllScoringWeightsQueryKey,
} from "@/api/generated/admin/admin";
import type { UpdateStageWeightsDtoWeights } from "@/api/generated/model/updateStageWeightsDtoWeights";
import type { UpdateStageWeightsDtoRationale } from "@/api/generated/model/updateStageWeightsDtoRationale";
import {
  Scale,
  Save,
  RefreshCw,
  Users,
  Target,
  Cpu,
  TrendingUp,
  DollarSign,
  Megaphone,
  PiggyBank,
  Shield,
  Handshake,
  LogOut,
  Info,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_protected/admin/scoring")({
  component: AdminScoring,
});

// ============================================================================
// Types
// ============================================================================

interface StageScoringWeight {
  id: string;
  stage: string;
  weights: UpdateStageWeightsDtoWeights;
  rationale: UpdateStageWeightsDtoRationale;
  overallRationale: string | null;
  lastModifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

type SectionId = keyof UpdateStageWeightsDtoWeights;

// ============================================================================
// Constants
// ============================================================================

const STAGES = [
  { id: "pre_seed", label: "Pre-Seed" },
  { id: "seed", label: "Seed" },
  { id: "series_a", label: "Series A" },
  { id: "series_b", label: "Series B" },
  { id: "series_c", label: "Series C" },
  { id: "series_d", label: "Series D" },
  { id: "series_e", label: "Series E" },
  { id: "series_f_plus", label: "Series F+" },
] as const;

const SECTIONS: { id: SectionId; label: string; icon: typeof Users }[] = [
  { id: "team", label: "Team", icon: Users },
  { id: "market", label: "Market", icon: Target },
  { id: "product", label: "Product", icon: Cpu },
  { id: "traction", label: "Traction", icon: TrendingUp },
  { id: "businessModel", label: "Business Model", icon: DollarSign },
  { id: "gtm", label: "Go-to-Market", icon: Megaphone },
  { id: "financials", label: "Financials", icon: PiggyBank },
  { id: "competitiveAdvantage", label: "Competitive Adv.", icon: Shield },
  { id: "legal", label: "Legal/Regulatory", icon: Scale },
  { id: "dealTerms", label: "Deal Terms", icon: Handshake },
  { id: "exitPotential", label: "Exit Potential", icon: LogOut },
];

// ============================================================================
// WeightEditor
// ============================================================================

function WeightEditor({
  stageData,
  onSave,
  isSaving,
}: {
  stageData: StageScoringWeight;
  onSave: (weights: UpdateStageWeightsDtoWeights, rationale: UpdateStageWeightsDtoRationale, overallRationale: string) => void;
  isSaving: boolean;
}) {
  const [weights, setWeights] = useState<UpdateStageWeightsDtoWeights>(stageData.weights);
  const [rationale, setRationale] = useState<UpdateStageWeightsDtoRationale>(stageData.rationale);
  const [overallRationale, setOverallRationale] = useState(stageData.overallRationale ?? "");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setWeights(stageData.weights);
    setRationale(stageData.rationale);
    setOverallRationale(stageData.overallRationale ?? "");
    setHasChanges(false);
  }, [stageData]);

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const isValid = totalWeight === 100;

  const handleWeightChange = (sectionId: SectionId, value: string) => {
    const numValue = parseInt(value) || 0;
    setWeights((prev) => ({ ...prev, [sectionId]: Math.max(0, Math.min(100, numValue)) }));
    setHasChanges(true);
  };

  const handleRationaleChange = (sectionId: SectionId, value: string) => {
    setRationale((prev) => ({ ...prev, [sectionId]: value }));
    setHasChanges(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Badge variant={isValid ? "default" : "destructive"} className="text-sm px-3 py-1">
          Total: {totalWeight}%
        </Badge>
        {!isValid && (
          <span className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            Must equal 100%
          </span>
        )}
        <Button
          onClick={() => onSave(weights, rationale, overallRationale)}
          disabled={!isValid || !hasChanges || isSaving}
          className="ml-auto"
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4" />
            Stage Philosophy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={overallRationale}
            onChange={(e) => {
              setOverallRationale(e.target.value);
              setHasChanges(true);
            }}
            placeholder="Explain the overall philosophy for scoring at this stage..."
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3 w-[180px]">
                  Section
                </th>
                <th className="text-center text-sm font-medium text-muted-foreground px-4 py-3 w-[100px]">
                  Weight
                </th>
                <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                  Rationale
                </th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <tr key={section.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm">{section.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Input
                          type="number"
                          value={weights[section.id]}
                          onChange={(e) => handleWeightChange(section.id, e.target.value)}
                          className="w-16 text-center h-8"
                          min={0}
                          max={100}
                        />
                        <span className="text-muted-foreground text-sm">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={rationale[section.id] ?? ""}
                        onChange={(e) => handleRationaleChange(section.id, e.target.value)}
                        placeholder={`Why this weight for ${section.label}?`}
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function AdminScoring() {
  const queryClient = useQueryClient();
  const [activeStage, setActiveStage] = useState("pre_seed");

  const { data: response, isLoading } = useAdminControllerGetAllScoringWeights();
  const allWeights = (response as unknown as StageScoringWeight[] | undefined) ?? [];

  const seedMutation = useAdminControllerSeedScoringWeights({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllScoringWeightsQueryKey() });
        toast.success("Default scoring weights initialized for all stages");
      },
      onError: () => toast.error("Failed to seed default weights"),
    },
  });

  const updateMutation = useAdminControllerUpdateScoringWeightsByStage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAllScoringWeightsQueryKey() });
        toast.success("Scoring weights updated");
      },
      onError: () => toast.error("Failed to update scoring weights"),
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scoring Weights</h1>
          <p className="text-muted-foreground">Configure how startups are scored based on their funding stage</p>
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Scoring Weights</h1>
          <p className="text-muted-foreground">Configure how startups are scored based on their funding stage</p>
        </div>
        {allWeights.length === 0 && (
          <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${seedMutation.isPending ? "animate-spin" : ""}`} />
            Initialize Default Weights
          </Button>
        )}
      </div>

      {allWeights.length > 0 ? (
        <Tabs value={activeStage} onValueChange={setActiveStage}>
          <TabsList className="grid grid-cols-4 lg:grid-cols-8 w-full">
            {STAGES.map((stage) => (
              <TabsTrigger key={stage.id} value={stage.id}>
                {stage.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {STAGES.map((stage) => {
            const stageData = allWeights.find((w) => w.stage === stage.id);
            return (
              <TabsContent key={stage.id} value={stage.id} className="mt-6">
                {stageData ? (
                  <WeightEditor
                    stageData={stageData}
                    isSaving={updateMutation.isPending}
                    onSave={(weights, rationale, overallRationale) =>
                      updateMutation.mutate({
                        stage: stage.id,
                        data: { weights, rationale, overallRationale },
                      })
                    }
                  />
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No weights configured for {stage.label}</p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => seedMutation.mutate()}
                        disabled={seedMutation.isPending}
                      >
                        Initialize Weights
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Scale className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">No Scoring Weights Configured</h3>
            <p className="text-muted-foreground mb-6">
              Click the button above to initialize default scoring weights for all startup stages.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
