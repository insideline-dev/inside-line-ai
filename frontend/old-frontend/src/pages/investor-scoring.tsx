import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Scale,
  Save,
  RotateCcw,
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
  HelpCircle
} from "lucide-react";
import type { StageScoringWeights, ScoringWeights, InvestorScoringPreference } from "@shared/schema";

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

function InvestorWeightEditor({ 
  stageId,
  defaultWeights,
  defaultRationale,
  overallRationale,
  preference,
  onSave
}: { 
  stageId: string;
  defaultWeights: ScoringWeights;
  defaultRationale: Record<string, string>;
  overallRationale?: string;
  preference?: InvestorScoringPreference;
  onSave: (useCustom: boolean, weights: ScoringWeights) => void;
}) {
  const [useCustom, setUseCustom] = useState(preference?.useCustomWeights ?? false);
  const [customWeights, setCustomWeights] = useState<ScoringWeights>(
    preference?.customWeights || { ...defaultWeights }
  );
  const [hasChanges, setHasChanges] = useState(false);

  const activeWeights = useCustom ? customWeights : defaultWeights;
  const totalWeight = Object.values(customWeights).reduce((sum, w) => sum + w, 0);
  const isValid = !useCustom || totalWeight === 100;

  const handleWeightChange = (sectionId: SectionId, value: string) => {
    const numValue = parseInt(value) || 0;
    setCustomWeights(prev => ({ ...prev, [sectionId]: Math.max(0, Math.min(100, numValue)) }));
    setHasChanges(true);
  };

  const handleToggleCustom = (checked: boolean) => {
    setUseCustom(checked);
    if (checked && !preference?.customWeights) {
      setCustomWeights({ ...defaultWeights });
    }
    setHasChanges(true);
  };

  const handleResetToDefaults = () => {
    setCustomWeights({ ...defaultWeights });
    setHasChanges(true);
  };

  const handleSave = () => {
    if (isValid) {
      onSave(useCustom, customWeights);
      setHasChanges(false);
    }
  };

  return (
    <div className="space-y-6">
      {overallRationale && (
        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4" />
              Stage Philosophy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{overallRationale}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border rounded-lg bg-background">
        <div className="flex items-center gap-3">
          <Switch
            id="use-custom"
            checked={useCustom}
            onCheckedChange={handleToggleCustom}
            data-testid="switch-use-custom"
          />
          <div>
            <Label htmlFor="use-custom" className="font-medium">
              Use Custom Weights
            </Label>
            <p className="text-xs text-muted-foreground">
              {useCustom 
                ? "Your custom weights will be used when viewing startup scores" 
                : "Using default platform weights"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {useCustom && (
            <>
              <Badge variant={isValid ? "default" : "destructive"}>
                Total: {totalWeight}%
              </Badge>
              {!isValid && (
                <span className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Must be 100%
                </span>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleResetToDefaults}
                data-testid="button-reset-defaults"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
            </>
          )}
          <Button 
            onClick={handleSave} 
            disabled={!isValid || !hasChanges}
            size="sm"
            data-testid="button-save-preferences"
          >
            <Save className="w-4 h-4 mr-1" />
            Save
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Section</TableHead>
              <TableHead className="w-[100px] text-center">Default</TableHead>
              {useCustom && <TableHead className="w-[100px] text-center">Your Weight</TableHead>}
              <TableHead>Rationale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const defaultWeight = defaultWeights[section.id];
              const currentWeight = activeWeights[section.id];
              const sectionRationale = defaultRationale[section.id];
              
              return (
                <TableRow key={section.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{section.label}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="min-w-[45px]">
                      {defaultWeight}%
                    </Badge>
                  </TableCell>
                  {useCustom && (
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Input
                          type="number"
                          value={currentWeight}
                          onChange={(e) => handleWeightChange(section.id, e.target.value)}
                          className="w-16 text-center h-8"
                          min={0}
                          max={100}
                          data-testid={`input-weight-${section.id}`}
                        />
                        <span className="text-muted-foreground text-sm">%</span>
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    {sectionRationale ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground cursor-help max-w-[300px] truncate">
                            <HelpCircle className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{sectionRationale}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[400px]">
                          <p>{sectionRationale}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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

export default function InvestorScoring() {
  const { toast } = useToast();
  const [activeStage, setActiveStage] = useState("seed");

  const { data: allWeights, isLoading: isLoadingWeights } = useQuery<StageScoringWeights[]>({
    queryKey: ["/api/investor/scoring-weights"],
  });

  const { data: preferences, isLoading: isLoadingPrefs } = useQuery<InvestorScoringPreference[]>({
    queryKey: ["/api/investor/scoring-preferences"],
  });

  const saveMutation = useMutation({
    mutationFn: async ({ stage, useCustomWeights, customWeights }: { 
      stage: string; 
      useCustomWeights: boolean;
      customWeights: ScoringWeights;
    }) => {
      return apiRequest("PUT", `/api/investor/scoring-preferences/${stage}`, {
        useCustomWeights,
        customWeights: useCustomWeights ? customWeights : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investor/scoring-preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investor/scoring-weights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scoring-weights"] });
      toast({
        title: "Preferences saved",
        description: "Your scoring preferences have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save preferences.",
        variant: "destructive",
      });
    },
  });

  const isLoading = isLoadingWeights || isLoadingPrefs;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!allWeights || allWeights.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scoring Methodology</h1>
          <p className="text-muted-foreground">
            Customize how startups are scored in your view
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Scale className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">Scoring Weights Not Configured</h3>
            <p className="text-muted-foreground">
              The platform administrator has not yet configured scoring weights.
            </p>
          </CardContent>
        </Card>
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

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-primary">How Custom Scoring Works</p>
              <p className="text-muted-foreground mt-1">
                When you enable custom weights, startups will be re-scored using your weights in your view.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeStage} onValueChange={setActiveStage}>
        <TabsList className="grid grid-cols-4 lg:grid-cols-8 w-full">
          {STAGES.map((stage) => {
            const hasCustom = preferences?.find(p => p.stage === stage.id)?.useCustomWeights;
            return (
              <TabsTrigger 
                key={stage.id} 
                value={stage.id} 
                className="relative"
                data-testid={`tab-stage-${stage.id}`}
              >
                {stage.label}
                {hasCustom && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        
        {STAGES.map((stage) => {
          const stageWeights = allWeights.find(w => w.stage === stage.id);
          const stagePref = preferences?.find(p => p.stage === stage.id);
          
          if (!stageWeights) return null;
          
          return (
            <TabsContent key={stage.id} value={stage.id} className="mt-6">
              <InvestorWeightEditor
                stageId={stage.id}
                defaultWeights={stageWeights.weights}
                defaultRationale={stageWeights.rationale}
                overallRationale={stageWeights.overallRationale || undefined}
                preference={stagePref}
                onSave={(useCustom, weights) => 
                  saveMutation.mutate({ 
                    stage: stage.id, 
                    useCustomWeights: useCustom, 
                    customWeights: weights 
                  })
                }
              />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
