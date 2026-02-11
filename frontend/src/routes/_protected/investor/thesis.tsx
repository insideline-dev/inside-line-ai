import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useInvestorControllerGetThesis,
  useInvestorControllerGetGeographyTaxonomy,
  useInvestorControllerCreateOrUpdateThesis,
  getInvestorControllerGetThesisQueryKey,
} from "@/api/generated/investor/investor";
import {
  buildThesisSavePayload,
  extractResponseData,
  mapLegacyLabelsToNodeIds,
  toggleGeographyNodeSelection,
  type GeographyNode,
  type ThesisFormData,
} from "./-thesis.helpers";

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

function buildParentNodeMap(
  nodes: GeographyNode[],
  parentId?: string,
  map = new Map<string, string>(),
): Map<string, string> {
  for (const node of nodes) {
    if (parentId) {
      map.set(node.id, parentId);
    }
    if (node.children?.length) {
      buildParentNodeMap(node.children, node.id, map);
    }
  }
  return map;
}

function collectExpandableNodeIds(nodes: GeographyNode[], ids: string[] = []): string[] {
  for (const node of nodes) {
    if (node.children?.length) {
      ids.push(node.id);
      collectExpandableNodeIds(node.children, ids);
    }
  }
  return ids;
}

function InvestorThesisPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: response, isLoading: isLoadingThesis } = useInvestorControllerGetThesis();
  const {
    data: taxonomyResponse,
    isLoading: isLoadingTaxonomy,
    isError: isTaxonomyError,
  } = useInvestorControllerGetGeographyTaxonomy();
  const thesis = useMemo(
    () => extractResponseData<Record<string, unknown> | null>(response),
    [response],
  );
  const taxonomyNodes = useMemo(
    () => {
      const taxonomy = extractResponseData<{ nodes?: GeographyNode[] }>(taxonomyResponse);
      return taxonomy?.nodes ?? [];
    },
    [taxonomyResponse],
  );

  const [formData, setFormData] = useState<ThesisFormData>({
    stages: ["seed", "series_a"],
    industries: ["software", "artificial_intelligence"],
    geographicFocusNodes: [],
    checkSizeMin: 500000,
    checkSizeMax: 3000000,
    notes: "",
  });
  const [expandedGeographyNodes, setExpandedGeographyNodes] = useState<string[]>([]);
  const parentNodeMap = useMemo(() => buildParentNodeMap(taxonomyNodes), [taxonomyNodes]);
  const expandableNodeIds = useMemo(() => collectExpandableNodeIds(taxonomyNodes), [taxonomyNodes]);

  // Populate form when thesis loads
  useEffect(() => {
    if (thesis && taxonomyNodes.length > 0) {
      const t = thesis;
      const savedGeoNodes = Array.isArray(t.geographicFocusNodes)
        ? t.geographicFocusNodes.filter((value): value is string => typeof value === "string")
        : [];
      const legacyGeo = Array.isArray(t.geographicFocus)
        ? t.geographicFocus.filter((value): value is string => typeof value === "string")
        : [];

      setFormData({
        stages: Array.isArray(t.stages)
          ? t.stages.filter((value): value is string => typeof value === "string")
          : ["seed", "series_a"],
        industries: Array.isArray(t.industries)
          ? t.industries.filter((value): value is string => typeof value === "string")
          : ["software", "artificial_intelligence"],
        geographicFocusNodes:
          savedGeoNodes.length > 0
            ? savedGeoNodes
            : mapLegacyLabelsToNodeIds(legacyGeo, taxonomyNodes),
        checkSizeMin: typeof t.checkSizeMin === "number" ? t.checkSizeMin : 500000,
        checkSizeMax: typeof t.checkSizeMax === "number" ? t.checkSizeMax : 3000000,
        notes: typeof t.notes === "string" ? t.notes : "",
      });
    }
  }, [thesis, taxonomyNodes]);

  useEffect(() => {
    if (!formData.geographicFocusNodes.length || taxonomyNodes.length === 0) {
      return;
    }

    const ancestors = new Set<string>();
    for (const nodeId of formData.geographicFocusNodes) {
      let currentParent = parentNodeMap.get(nodeId);
      while (currentParent) {
        ancestors.add(currentParent);
        currentParent = parentNodeMap.get(currentParent);
      }
    }

    if (ancestors.size === 0) {
      return;
    }

    setExpandedGeographyNodes((prev) => Array.from(new Set([...prev, ...Array.from(ancestors)])));
  }, [formData.geographicFocusNodes, parentNodeMap, taxonomyNodes.length]);

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

  const handleGeoToggle = (nodeId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      geographicFocusNodes: toggleGeographyNodeSelection(
        prev.geographicFocusNodes,
        nodeId,
        checked,
      ),
    }));
  };

  const handleGeoExpandToggle = (nodeId: string) => {
    setExpandedGeographyNodes((prev) =>
      prev.includes(nodeId)
        ? prev.filter((id) => id !== nodeId)
        : [...prev, nodeId],
    );
  };

  const handleExpandAllGeographies = () => {
    setExpandedGeographyNodes(expandableNodeIds);
  };

  const handleCollapseAllGeographies = () => {
    setExpandedGeographyNodes([]);
  };

  const handleSave = () => {
    saveThesis({
      data: buildThesisSavePayload(formData),
    });
  };

  const renderGeographyNode = (node: GeographyNode, depth = 0) => (
    <div key={node.id} className="space-y-1">
      <div
        className="flex items-center gap-2 rounded-md py-1 pr-1 hover:bg-muted/40"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {node.children?.length ? (
          <button
            type="button"
            aria-label={
              expandedGeographyNodes.includes(node.id) ? `Collapse ${node.label}` : `Expand ${node.label}`
            }
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
            onClick={() => handleGeoExpandToggle(node.id)}
          >
            {expandedGeographyNodes.includes(node.id) ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="inline-block h-5 w-5" />
        )}
        <Checkbox
          id={node.id}
          checked={formData.geographicFocusNodes.includes(node.id)}
          onCheckedChange={(checked) => handleGeoToggle(node.id, !!checked)}
        />
        <Label
          htmlFor={node.id}
          className={`cursor-pointer ${node.level === 1 ? "font-semibold" : ""}`}
        >
          {node.label}
        </Label>
      </div>
      {node.children?.length && expandedGeographyNodes.includes(node.id) ? (
        <div className="ml-2 space-y-1 border-l border-border/60">
          {node.children.map((child) => renderGeographyNode(child, depth + 1))}
        </div>
      ) : null}
    </div>
  );

  if (isLoadingThesis || isLoadingTaxonomy) {
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
            <CardDescription>
              Select your regional focus (Level 1/2/3). Expand regions to drill down.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-h-[460px] overflow-y-auto">
            {isTaxonomyError ? (
              <p className="text-sm text-destructive">
                Failed to load geography taxonomy. Please refresh and try again.
              </p>
            ) : taxonomyNodes.length > 0 ? (
              <>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleExpandAllGeographies}
                    disabled={expandableNodeIds.length === 0}
                  >
                    Expand all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCollapseAllGeographies}
                    disabled={expandedGeographyNodes.length === 0}
                  >
                    Collapse all
                  </Button>
                </div>
                <div className="space-y-1">
                  {taxonomyNodes.map((node) => renderGeographyNode(node))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No geography taxonomy available.
              </p>
            )}
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
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
