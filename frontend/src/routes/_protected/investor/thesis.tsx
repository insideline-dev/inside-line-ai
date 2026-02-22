import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  FileText,
  Globe,
  Lightbulb,
  Loader2,
  RefreshCw,
  Save,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useInvestorControllerGetThesis,
  useInvestorControllerGetGeographyTaxonomy,
  useInvestorControllerCreateOrUpdateThesis,
  getInvestorControllerGetThesisQueryKey,
} from "@/api/generated/investor/investor";
import { customFetch } from "@/api/client";
import { industryGroups } from "@/data/industries";
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
  { id: "growth", label: "Growth" },
];

// Legacy industry IDs to map to new industry group values (backward compatibility)
const LEGACY_INDUSTRY_MAP: Record<string, string> = {
  fintech: "financial_services",
  climate_tech: "sustainability",
  ecommerce: "commerce_shopping",
};

const businessModelOptions = [
  { id: "b2b_saas", label: "B2B SaaS" },
  { id: "fintech_lending", label: "Fintech/Lending" },
  { id: "enterprise_sales", label: "Enterprise Sales" },
  { id: "b2c_saas", label: "B2C SaaS" },
  { id: "hardware", label: "Hardware" },
  { id: "api_infrastructure", label: "API/Infrastructure" },
  { id: "marketplace", label: "Marketplace" },
  { id: "consumer_app", label: "Consumer App" },
];

function formatNumberWithCommas(value: number | null | undefined): string {
  if (value === undefined || value === null) return "";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(num)) return "";
  return num.toLocaleString("en-US");
}

function parseFormattedNumber(value: string): number | null {
  if (!value.trim()) return null;
  const cleaned = value.replace(/[,$\s]/g, "");
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

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
    stages: [],
    industries: [],
    geographicFocusNodes: [],
    businessModels: [],
    checkSizeMin: 100000,
    checkSizeMax: 5000000,
    minRevenue: null,
    notes: "",
    thesisNarrative: "",
    antiPortfolio: "",
    website: "",
    fundSize: null,
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
          : [],
        industries: Array.isArray(t.industries)
          ? t.industries
              .filter((value): value is string => typeof value === "string")
              .map((v) => LEGACY_INDUSTRY_MAP[v] ?? v)
          : [],
        geographicFocusNodes:
          savedGeoNodes.length > 0
            ? savedGeoNodes
            : mapLegacyLabelsToNodeIds(legacyGeo, taxonomyNodes),
        businessModels: Array.isArray(t.businessModels)
          ? t.businessModels.filter((value): value is string => typeof value === "string")
          : [],
        checkSizeMin: typeof t.checkSizeMin === "number" ? t.checkSizeMin : 100000,
        checkSizeMax: typeof t.checkSizeMax === "number" ? t.checkSizeMax : 5000000,
        minRevenue: typeof t.minRevenue === "number" ? t.minRevenue : null,
        notes: typeof t.notes === "string" ? t.notes : "",
        thesisNarrative:
          typeof t.thesisNarrative === "string"
            ? t.thesisNarrative
            : typeof t.notes === "string"
              ? t.notes
              : "",
        antiPortfolio: typeof t.antiPortfolio === "string" ? t.antiPortfolio : "",
        website: typeof t.website === "string" ? t.website : "",
        fundSize: typeof t.fundSize === "number" ? t.fundSize : null,
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

  const { mutate: generateSummary, isPending: isGenerating } = useMutation({
    mutationFn: () =>
      customFetch<Record<string, unknown>>("/investor/thesis/generate-summary", {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Thesis summary generated");
      queryClient.invalidateQueries({ queryKey: getInvestorControllerGetThesisQueryKey() });
    },
    onError: (error: Error) => {
      toast.error("Failed to generate summary", { description: error.message });
    },
  });

  const handleGenerateSummary = useCallback(() => {
    generateSummary();
  }, [generateSummary]);

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

  const handleBusinessModelToggle = (modelId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      businessModels: checked
        ? [...prev.businessModels, modelId]
        : prev.businessModels.filter((m) => m !== modelId),
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

  const handleCancelNarrative = () => {
    if (thesis) {
      setFormData((prev) => ({
        ...prev,
        thesisNarrative:
          typeof thesis.thesisNarrative === "string"
            ? thesis.thesisNarrative
            : typeof thesis.notes === "string"
              ? thesis.notes
              : "",
        antiPortfolio:
          typeof thesis.antiPortfolio === "string" ? thesis.antiPortfolio : "",
      }));
    }
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

      {thesis && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Thesis Summary
                </CardTitle>
                <CardDescription>
                  {thesis.thesisSummaryGeneratedAt
                    ? `Last generated ${new Date(thesis.thesisSummaryGeneratedAt as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                    : "Generate a readable summary of your investment thesis"}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleGenerateSummary}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {thesis.thesisSummary ? "Regenerate" : "Generate Summary"}
              </Button>
            </div>
          </CardHeader>
          {typeof thesis.thesisSummary === "string" && thesis.thesisSummary && (
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {thesis.thesisSummary}
              </p>
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Stage Preferences
            </CardTitle>
            <CardDescription>What stages do you invest in?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center space-x-2 rounded-md border border-border/60 p-3 hover:bg-muted/40"
                >
                  <Checkbox
                    id={stage.id}
                    checked={formData.stages.includes(stage.id)}
                    onCheckedChange={(checked) => handleStageToggle(stage.id, !!checked)}
                  />
                  <Label htmlFor={stage.id} className="cursor-pointer font-normal">
                    {stage.label}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              $ Check Size
            </CardTitle>
            <CardDescription>Typical investment range per deal (optional)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkSizeMin">Minimum</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="checkSizeMin"
                    type="text"
                    placeholder="100,000"
                    className="pl-7"
                    value={formatNumberWithCommas(formData.checkSizeMin)}
                    onChange={(e) => {
                      const val = parseFormattedNumber(e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        checkSizeMin: val ?? prev.checkSizeMin,
                      }));
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkSizeMax">Maximum</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="checkSizeMax"
                    type="text"
                    placeholder="5,000,000"
                    className="pl-7"
                    value={formatNumberWithCommas(formData.checkSizeMax)}
                    onChange={(e) => {
                      const val = parseFormattedNumber(e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        checkSizeMax: val ?? prev.checkSizeMax,
                      }));
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minRevenue">Minimum ARR (optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="minRevenue"
                  type="text"
                  placeholder="1,000,000"
                  className="pl-7"
                  value={formatNumberWithCommas(formData.minRevenue)}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      minRevenue: parseFormattedNumber(e.target.value),
                    }))
                  }
                />
              </div>
              <p className="text-sm text-muted-foreground">Minimum annual recurring revenue</p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Industry Groups
            </CardTitle>
            <CardDescription>Which industry groups are you focused on?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {industryGroups.map((group) => (
                <div
                  key={group.value}
                  className="flex items-center space-x-2 rounded-md border border-border/60 p-3 hover:bg-muted/40"
                >
                  <Checkbox
                    id={group.value}
                    checked={formData.industries.includes(group.value)}
                    onCheckedChange={(checked) => handleSectorToggle(group.value, !!checked)}
                  />
                  <Label htmlFor={group.value} className="cursor-pointer font-normal">
                    {group.label}
                  </Label>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Select all that apply ({industryGroups.length} categories available)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Business Models
            </CardTitle>
            <CardDescription>What business models do you prefer?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {businessModelOptions.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center space-x-2 rounded-md border border-border/60 p-3 hover:bg-muted/40"
                >
                  <Checkbox
                    id={model.id}
                    checked={formData.businessModels.includes(model.id)}
                    onCheckedChange={(checked) => handleBusinessModelToggle(model.id, !!checked)}
                  />
                  <Label htmlFor={model.id} className="cursor-pointer font-normal">
                    {model.label}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Fund Information
            </CardTitle>
            <CardDescription>Details about your fund (optional)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://yourfund.com"
                    className="pl-9"
                    value={formData.website}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, website: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fundSize">Fund Size (AUM)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="fundSize"
                    type="text"
                    placeholder="50,000,000"
                    className="pl-7"
                    value={formatNumberWithCommas(formData.fundSize)}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        fundSize: parseFormattedNumber(e.target.value),
                      }))
                    }
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Total assets under management
                </p>
              </div>
            </div>
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
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Thesis Narrative
            </CardTitle>
            <CardDescription>Describe your investment thesis in your own words.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="font-medium">What makes a company interesting to you?</p>
              <Textarea
                placeholder="We look for companies that..."
                className="min-h-[120px] resize-none"
                value={formData.thesisNarrative}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, thesisNarrative: e.target.value }))
                }
              />
              <p className="text-sm text-muted-foreground">
                Our AI will use this to better match you with relevant opportunities.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-medium">What would you NOT invest in?</p>
              <Textarea
                placeholder="We avoid companies that..."
                className="min-h-[120px] resize-none"
                value={formData.antiPortfolio}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, antiPortfolio: e.target.value }))
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCancelNarrative}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Thesis
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
