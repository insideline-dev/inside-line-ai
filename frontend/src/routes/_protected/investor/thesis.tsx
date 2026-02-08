import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useInvestorControllerGetThesis,
  useInvestorControllerCreateOrUpdateThesis,
  getInvestorControllerGetThesisQueryKey,
} from "@/api/generated/investor/investor";

export const Route = createFileRoute("/_protected/investor/thesis")({
  component: InvestorThesisPage,
});

const stages = [
  { id: "pre_seed", label: "Pre-Seed" },
  { id: "seed", label: "Seed" },
  { id: "series_a", label: "Series A" },
  { id: "series_b", label: "Series B" },
  { id: "series_c", label: "Series C+" },
];

const sectors = [
  { id: "software", label: "Software/SaaS" },
  { id: "artificial_intelligence", label: "AI/ML" },
  { id: "fintech", label: "FinTech" },
  { id: "health_care", label: "HealthTech" },
  { id: "climate_tech", label: "Climate Tech" },
  { id: "ecommerce", label: "E-Commerce" },
];

const geographies = ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East"];

interface ThesisFormData {
  stages: string[];
  industries: string[];
  geographicFocus: string[];
  checkSizeMin: number;
  checkSizeMax: number;
  narrative: string;
}

function InvestorThesisPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: response, isLoading } = useInvestorControllerGetThesis();
  const thesis = response?.data;

  const [formData, setFormData] = useState<ThesisFormData>({
    stages: ["seed", "series_a"],
    industries: ["software", "artificial_intelligence"],
    geographicFocus: ["North America", "Europe"],
    checkSizeMin: 500000,
    checkSizeMax: 3000000,
    narrative: "",
  });

  // Populate form when thesis loads
  useEffect(() => {
    if (thesis) {
      const t = thesis as ThesisFormData & Record<string, unknown>;
      setFormData({
        stages: t.stages ?? ["seed", "series_a"],
        industries: t.industries ?? ["software", "artificial_intelligence"],
        geographicFocus: t.geographicFocus ?? ["North America", "Europe"],
        checkSizeMin: t.checkSizeMin ?? 500000,
        checkSizeMax: t.checkSizeMax ?? 3000000,
        narrative: t.narrative ?? "",
      });
    }
  }, [thesis]);

  const { mutate: saveThesis, isPending: isSaving } = useInvestorControllerCreateOrUpdateThesis({
    mutation: {
      onSuccess: () => {
        toast.success("Thesis saved successfully");
        queryClient.invalidateQueries({ queryKey: getInvestorControllerGetThesisQueryKey() });
      },
      onError: (error) => {
        toast.error("Failed to save thesis", { description: (error as Error).message });
      },
    },
  });

  const handleStageToggle = (stageId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      stages: checked
        ? [...prev.stages, stageId]
        : prev.stages.filter((s) => s !== stageId),
    }));
  };

  const handleSectorToggle = (sectorId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      industries: checked
        ? [...prev.industries, sectorId]
        : prev.industries.filter((s) => s !== sectorId),
    }));
  };

  const handleGeoToggle = (geo: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      geographicFocus: checked
        ? [...prev.geographicFocus, geo]
        : prev.geographicFocus.filter((g) => g !== geo),
    }));
  };

  const handleSave = () => {
    saveThesis({ data: formData });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Investment Thesis</h1>
            <p className="text-muted-foreground">Configure your investment preferences</p>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investment Thesis</h1>
          <p className="text-muted-foreground">Configure your investment preferences</p>
        </div>
        <Button className="gap-2" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funding Stages</CardTitle>
            <CardDescription>Select the stages you invest in</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stages.map((stage) => (
              <div key={stage.id} className="flex items-center space-x-2">
                <Checkbox
                  id={stage.id}
                  checked={formData.stages.includes(stage.id)}
                  onCheckedChange={(checked) => handleStageToggle(stage.id, !!checked)}
                />
                <Label htmlFor={stage.id}>{stage.label}</Label>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Check Size</CardTitle>
            <CardDescription>Your typical investment range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min">Minimum ($)</Label>
                <Input
                  id="min"
                  type="number"
                  placeholder="500,000"
                  value={formData.checkSizeMin}
                  onChange={(e) => setFormData((prev) => ({ ...prev, checkSizeMin: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max">Maximum ($)</Label>
                <Input
                  id="max"
                  type="number"
                  placeholder="3,000,000"
                  value={formData.checkSizeMax}
                  onChange={(e) => setFormData((prev) => ({ ...prev, checkSizeMax: Number(e.target.value) }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sectors</CardTitle>
            <CardDescription>Industries you focus on</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sectors.map((sector) => (
              <div key={sector.id} className="flex items-center space-x-2">
                <Checkbox
                  id={sector.id}
                  checked={formData.industries.includes(sector.id)}
                  onCheckedChange={(checked) => handleSectorToggle(sector.id, !!checked)}
                />
                <Label htmlFor={sector.id}>{sector.label}</Label>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Geographies</CardTitle>
            <CardDescription>Regions you invest in</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {geographies.map((geo) => (
              <div key={geo} className="flex items-center space-x-2">
                <Checkbox
                  id={geo}
                  checked={formData.geographicFocus.includes(geo)}
                  onCheckedChange={(checked) => handleGeoToggle(geo, !!checked)}
                />
                <Label htmlFor={geo}>{geo}</Label>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thesis Narrative</CardTitle>
            <CardDescription>Describe your investment thesis in detail</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="We invest in early-stage B2B SaaS companies with strong technical founders..."
              className="min-h-[150px]"
              value={formData.narrative}
              onChange={(e) => setFormData((prev) => ({ ...prev, narrative: e.target.value }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
