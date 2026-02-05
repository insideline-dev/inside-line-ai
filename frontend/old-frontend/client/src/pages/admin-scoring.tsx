import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  AlertCircle
} from "lucide-react";
import type { StageScoringWeights, ScoringWeights, ScoringRationale } from "@shared/schema";

const STAGES = [
  { id: "pre_seed", label: "Pre-Seed" },
  { id: "seed", label: "Seed" },
  { id: "series_a", label: "Series A" },
  { id: "series_b", label: "Series B" },
  { id: "series_c", label: "Series C" },
  { id: "series_d", label: "Series D" },
  { id: "series_e", label: "Series E" },
  { id: "series_f_plus", label: "Series F+" },
];

const SECTIONS = [
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
] as const;

type SectionId = typeof SECTIONS[number]["id"];

function WeightEditor({ 
  stageData, 
  onSave 
}: { 
  stageData: StageScoringWeights; 
  onSave: (weights: ScoringWeights, rationale: ScoringRationale, overallRationale: string) => void;
}) {
  const [weights, setWeights] = useState<ScoringWeights>(stageData.weights);
  const [rationale, setRationale] = useState<ScoringRationale>(stageData.rationale);
  const [overallRationale, setOverallRationale] = useState<string>(stageData.overallRationale || "");
  const [hasChanges, setHasChanges] = useState(false);

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const isValid = totalWeight === 100;

  const handleWeightChange = (sectionId: SectionId, value: string) => {
    const numValue = parseInt(value) || 0;
    setWeights(prev => ({ ...prev, [sectionId]: Math.max(0, Math.min(100, numValue)) }));
    setHasChanges(true);
  };

  const handleRationaleChange = (sectionId: SectionId, value: string) => {
    setRationale(prev => ({ ...prev, [sectionId]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (isValid) {
      onSave(weights, rationale, overallRationale);
      setHasChanges(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge variant={isValid ? "default" : "destructive"} className="text-sm px-3 py-1">
            Total: {totalWeight}%
          </Badge>
          {!isValid && (
            <span className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              Must equal 100%
            </span>
          )}
        </div>
        <Button 
          onClick={handleSave} 
          disabled={!isValid || !hasChanges}
          data-testid="button-save-weights"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
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
            data-testid="textarea-overall-rationale"
          />
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Section</TableHead>
              <TableHead className="w-[80px] text-center">Weight</TableHead>
              <TableHead>Rationale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const weight = weights[section.id];
              const sectionRationale = rationale[section.id] || "";
              
              return (
                <TableRow key={section.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{section.label}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Input
                        type="number"
                        value={weight}
                        onChange={(e) => handleWeightChange(section.id, e.target.value)}
                        className="w-16 text-center h-8"
                        min={0}
                        max={100}
                        data-testid={`input-weight-${section.id}`}
                      />
                      <span className="text-muted-foreground text-sm">%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={sectionRationale}
                      onChange={(e) => handleRationaleChange(section.id, e.target.value)}
                      placeholder={`Why this weight for ${section.label}?`}
                      className="h-8 text-sm"
                      data-testid={`input-rationale-${section.id}`}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

export default function AdminScoring() {
  const { toast } = useToast();
  const [activeStage, setActiveStage] = useState("pre_seed");

  const { data: allWeights, isLoading } = useQuery<StageScoringWeights[]>({
    queryKey: ["/api/admin/scoring-weights"],
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/scoring-weights/seed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scoring-weights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scoring-weights"] });
      toast({
        title: "Weights seeded",
        description: "Default scoring weights have been created for all stages.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to seed default weights.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ stage, weights, rationale, overallRationale }: { 
      stage: string; 
      weights: ScoringWeights; 
      rationale: ScoringRationale;
      overallRationale: string;
    }) => {
      return apiRequest("PUT", `/api/admin/scoring-weights/${stage}`, {
        weights,
        rationale,
        overallRationale,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scoring-weights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scoring-weights"] });
      toast({
        title: "Weights updated",
        description: "Scoring weights have been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update scoring weights.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Scoring Weights</h1>
          <p className="text-muted-foreground">
            Configure how startups are scored based on their funding stage
          </p>
        </div>
        {(!allWeights || allWeights.length === 0) && (
          <Button 
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            data-testid="button-seed-weights"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${seedMutation.isPending ? 'animate-spin' : ''}`} />
            Initialize Default Weights
          </Button>
        )}
      </div>

      {allWeights && allWeights.length > 0 ? (
        <Tabs value={activeStage} onValueChange={setActiveStage}>
          <TabsList className="grid grid-cols-4 lg:grid-cols-8 w-full">
            {STAGES.map((stage) => (
              <TabsTrigger key={stage.id} value={stage.id} data-testid={`tab-stage-${stage.id}`}>
                {stage.label}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {STAGES.map((stage) => {
            const stageData = allWeights.find(w => w.stage === stage.id);
            
            return (
              <TabsContent key={stage.id} value={stage.id} className="mt-6">
                {stageData ? (
                  <WeightEditor
                    stageData={stageData}
                    onSave={(weights, rationale, overallRationale) => 
                      updateMutation.mutate({ stage: stage.id, weights, rationale, overallRationale })
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
