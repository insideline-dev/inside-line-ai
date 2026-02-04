import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Bot,
  Workflow,
  Users,
  TrendingUp,
  Package,
  Target,
  DollarSign,
  BarChart3,
  Shield,
  Scale,
  Landmark,
  GitMerge,
  Save,
  X,
  Wrench,
  FileInput,
  FileOutput,
  RefreshCw,
  ArrowDown,
  FileSearch,
  Globe,
  Linkedin,
  Newspaper,
  Layers,
  FileText,
  Handshake,
} from "lucide-react";
import type { AgentPrompt } from "@/types/admin";
import { mockAgents } from "@/mocks/data/agents";

export const Route = createFileRoute("/_protected/admin/agents")({
  component: AdminAgentsPage,
});

// Agent icon mapping
const agentIcons: Record<string, typeof Bot> = {
  // Evaluation agents
  orchestrator: Workflow,
  team: Users,
  market: TrendingUp,
  product: Package,
  traction: Target,
  businessModel: DollarSign,
  gtm: BarChart3,
  financials: DollarSign,
  competitiveAdvantage: Shield,
  legal: Scale,
  dealTerms: Landmark,
  exitPotential: GitMerge,
  synthesis: GitMerge,
  // Research pipeline agents
  dataExtraction: FileSearch,
  teamLinkedInResearch: Linkedin,
  researchOrchestrator: Layers,
  teamDeepResearch: Users,
  marketDeepResearch: TrendingUp,
  productDeepResearch: Package,
  newsSearch: Newspaper,
  // Investor matching agents
  investorThesis: FileText,
  thesisAlignment: Handshake,
};

// Category colors - optimized for both light and dark modes
const categoryColors: Record<string, string> = {
  orchestrator:
    "bg-purple-100 dark:bg-purple-500/20 border-purple-400 dark:border-purple-500/50 text-purple-900 dark:text-purple-100 hover:bg-purple-200 dark:hover:bg-purple-500/30 shadow-sm",
  analysis:
    "bg-blue-100 dark:bg-blue-500/20 border-blue-400 dark:border-blue-500/50 text-blue-900 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-500/30 shadow-sm",
  synthesis:
    "bg-emerald-100 dark:bg-emerald-500/20 border-emerald-400 dark:border-emerald-500/50 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 shadow-sm",
  extraction:
    "bg-amber-100 dark:bg-amber-500/20 border-amber-400 dark:border-amber-500/50 text-amber-900 dark:text-amber-100 hover:bg-amber-200 dark:hover:bg-amber-500/30 shadow-sm",
  research:
    "bg-orange-100 dark:bg-orange-500/20 border-orange-400 dark:border-orange-500/50 text-orange-900 dark:text-orange-100 hover:bg-orange-200 dark:hover:bg-orange-500/30 shadow-sm",
  investor:
    "bg-indigo-100 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500/50 text-indigo-900 dark:text-indigo-100 hover:bg-indigo-200 dark:hover:bg-indigo-500/30 shadow-sm",
};

// Variable Highlighter Component
function VariableHighlighter({ text }: { text: string }) {
  const parts = text.split(/(\{[^}]+\})/g);

  return (
    <div className="whitespace-pre-wrap font-mono text-sm">
      {parts.map((part, index) => {
        if (part.startsWith("{") && part.endsWith("}")) {
          return (
            <span
              key={index}
              className="bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1 py-0.5 rounded border border-amber-500/30 font-semibold"
            >
              {part}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
}

// Agent Box Component
function AgentBox({
  agent,
  onClick,
  size = "normal",
}: {
  agent: AgentPrompt;
  onClick: () => void;
  size?: "normal" | "large";
}) {
  const Icon = agentIcons[agent.agentKey] || Bot;
  const colorClass = categoryColors[agent.category || "analysis"] || categoryColors.analysis;

  return (
    <button
      onClick={onClick}
      className={`${colorClass} border-2 rounded-lg cursor-pointer transition-all ${
        size === "large" ? "px-6 py-4" : "px-3 py-2"
      }`}
      data-testid={`agent-box-${agent.agentKey}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={size === "large" ? "w-6 h-6" : "w-4 h-4"} />
        <span className={`font-semibold ${size === "large" ? "text-base" : "text-xs"}`}>
          {agent.displayName.replace(" Agent", "").replace(" Analysis", "")}
        </span>
      </div>
    </button>
  );
}

// Agent Editor Panel Component
function AgentEditorPanel({
  agent,
  isOpen,
  onClose,
  onSave,
  isSaving,
}: {
  agent: AgentPrompt | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<AgentPrompt>) => void;
  isSaving: boolean;
}) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [humanPrompt, setHumanPrompt] = useState("");
  const [description, setDescription] = useState("");

  const variables = useMemo(() => {
    if (!agent) return [];
    const allText = (agent.systemPrompt || "") + " " + (agent.humanPrompt || "");
    const matches = allText.match(/\{([^}]+)\}/g) || [];
    return Array.from(new Set(matches.map((m) => m.slice(1, -1))));
  }, [agent]);

  useEffect(() => {
    if (agent) {
      setSystemPrompt(agent.systemPrompt);
      setHumanPrompt(agent.humanPrompt || "");
      setDescription(agent.description || "");
    }
  }, [agent]);

  if (!agent) return null;

  const handleSave = () => {
    onSave({
      systemPrompt,
      humanPrompt,
      description,
    });
  };

  const hasChanges =
    systemPrompt !== agent.systemPrompt ||
    humanPrompt !== (agent.humanPrompt || "") ||
    description !== (agent.description || "");

  const Icon = agentIcons[agent.agentKey] || Bot;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5" />
            {agent.displayName}
          </SheetTitle>
          <SheetDescription>Edit the prompts and configuration for this agent</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="prompts" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="prompts" data-testid="tab-prompts">
              Prompts
            </TabsTrigger>
            <TabsTrigger value="io" data-testid="tab-io">
              Inputs/Outputs
            </TabsTrigger>
            <TabsTrigger value="preview" data-testid="tab-preview">
              Preview
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="prompts" className="space-y-4 px-1">
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of what this agent does"
                  data-testid="input-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                  placeholder="The system instructions for this agent..."
                  data-testid="textarea-system-prompt"
                />
                <p className="text-xs text-muted-foreground">
                  Variables in curly braces (e.g., {"{companyName}"}) will be replaced with actual
                  values at runtime.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="humanPrompt">Human Prompt Template</Label>
                <Textarea
                  id="humanPrompt"
                  value={humanPrompt}
                  onChange={(e) => setHumanPrompt(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                  placeholder="The human message template..."
                  data-testid="textarea-human-prompt"
                />
              </div>

              <div className="space-y-2">
                <Label>Detected Variables</Label>
                <div className="flex flex-wrap gap-1">
                  {variables.map((variable) => (
                    <Badge
                      key={variable}
                      variant="outline"
                      className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    >
                      {"{" + variable + "}"}
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="io" className="space-y-4 px-1">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileInput className="w-4 h-4" />
                  Inputs
                </Label>
                <div className="space-y-2">
                  {agent.inputs?.map((input, index) => (
                    <div key={index} className="flex items-start gap-2 p-2 bg-muted/50 rounded-md">
                      <Badge variant={input.required ? "default" : "secondary"} className="text-xs">
                        {input.key}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{input.description}</span>
                    </div>
                  ))}
                  {(!agent.inputs || agent.inputs.length === 0) && (
                    <p className="text-sm text-muted-foreground">No inputs defined</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileOutput className="w-4 h-4" />
                  Outputs
                </Label>
                <div className="space-y-2">
                  {agent.outputs?.map((output, index) => (
                    <div key={index} className="flex items-start gap-2 p-2 bg-muted/50 rounded-md">
                      <Badge variant="outline" className="text-xs">
                        {output.key}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {output.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{output.description}</span>
                    </div>
                  ))}
                  {(!agent.outputs || agent.outputs.length === 0) && (
                    <p className="text-sm text-muted-foreground">No outputs defined</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  Tools
                </Label>
                <div className="flex flex-wrap gap-1">
                  {agent.tools?.map((tool) => (
                    <Badge key={tool} variant="outline">
                      {tool}
                    </Badge>
                  ))}
                  {(!agent.tools || agent.tools.length === 0) && (
                    <p className="text-sm text-muted-foreground">No tools configured</p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="space-y-4 px-1">
              <div className="space-y-2">
                <Label>System Prompt Preview</Label>
                <div className="p-3 bg-muted/50 rounded-md max-h-[250px] overflow-auto">
                  <VariableHighlighter text={systemPrompt} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Human Prompt Preview</Label>
                <div className="p-3 bg-muted/50 rounded-md max-h-[200px] overflow-auto">
                  <VariableHighlighter text={humanPrompt} />
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <SheetFooter className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              Version {agent.version}
              {agent.lastModifiedBy && ` • Last edited by ${agent.lastModifiedBy}`}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} data-testid="button-cancel">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges || isSaving} data-testid="button-save">
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// Main Page Component
function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentPrompt[]>(mockAgents);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentPrompt | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleAgentClick = (agent: AgentPrompt) => {
    setSelectedAgent(agent);
    setIsPanelOpen(true);
  };

  const handleSave = async (updates: Partial<AgentPrompt>) => {
    if (!selectedAgent) return;

    setIsSaving(true);

    // Simulate API save
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Update local state
    setAgents((prev) =>
      prev.map((a) =>
        a.agentKey === selectedAgent.agentKey
          ? { ...a, ...updates, version: a.version + 1, updatedAt: new Date().toISOString() }
          : a
      )
    );

    setIsSaving(false);
    setIsPanelOpen(false);
    toast.success("Agent updated", {
      description: "The agent prompt has been saved successfully.",
    });
  };

  const handleSeedAgents = async () => {
    toast.success("Agents initialized", {
      description: "Default agent prompts have been created.",
    });
  };

  // Get agents for each stage
  const researchOrchestrator = agents.find((a) => a.agentKey === "researchOrchestrator");
  const researchAgentKeys = ["teamDeepResearch", "marketDeepResearch", "productDeepResearch", "newsSearch"];
  const researchAgents = agents.filter((a) => researchAgentKeys.includes(a.agentKey));

  const orchestrator = agents.find((a) => a.agentKey === "orchestrator");
  const analysisAgents = agents.filter((a) => a.category === "analysis");
  const synthesisAgent = agents.find((a) => a.agentKey === "synthesis");

  const investorAgents = agents.filter((a) => a.category === "investor");

  // Split analysis agents into two rows
  const row1Agents = analysisAgents.slice(0, 6);
  const row2Agents = analysisAgents.slice(6);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const noAgents = agents.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Agent Prompts
          </h1>
          <p className="text-muted-foreground">
            View and edit the AI agents that analyze startups. Click on any agent to edit its prompts.
          </p>
        </div>
        <div className="flex gap-2">
          {noAgents && (
            <Button onClick={handleSeedAgents} data-testid="button-seed-agents">
              Initialize Agents
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="w-5 h-5" />
            5-Stage Research, Evaluation & Matching Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {noAgents ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No agents configured. Click "Initialize Agents" to set up the default agents.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 space-y-4">
              {/* Stage 1: Data Extraction (visual only - not an agent) */}
              <div className="text-center">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Stage 1: Data Extraction
                </div>
                <div className="flex gap-3 justify-center">
                  <div className="px-4 py-3 rounded-lg border-2 border-dashed border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-950/30">
                    <div className="flex items-center gap-2 text-amber-900 dark:text-amber-400">
                      <FileSearch className="w-5 h-5" />
                      <span className="font-medium">Document Parsing</span>
                    </div>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">Extract text from pitch deck</p>
                  </div>
                  <div className="px-4 py-3 rounded-lg border-2 border-dashed border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-950/30">
                    <div className="flex items-center gap-2 text-amber-900 dark:text-amber-400">
                      <Globe className="w-5 h-5" />
                      <span className="font-medium">Website Scraping</span>
                    </div>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">Deep scrape up to 20 pages</p>
                  </div>
                </div>
              </div>

              {/* Arrow down */}
              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="w-5 h-5" />
              </div>

              {/* Stage 2: Team LinkedIn Research (visual only - not an agent) */}
              <div className="text-center">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Stage 2: Team LinkedIn Research
                </div>
                <div className="px-4 py-3 rounded-lg border-2 border-dashed border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-400">
                    <Linkedin className="w-5 h-5" />
                    <span className="font-medium">LinkedIn Enrichment</span>
                  </div>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
                    Discover team members & fetch profiles via Unipile
                  </p>
                </div>
              </div>

              {/* Arrow down */}
              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="w-5 h-5" />
              </div>

              {/* Stage 3: Research Orchestrator + 4 Research Agents */}
              <div className="text-center">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Stage 3: Deep Research
                </div>
                {researchOrchestrator && (
                  <AgentBox
                    agent={researchOrchestrator}
                    onClick={() => handleAgentClick(researchOrchestrator)}
                    size="large"
                  />
                )}
              </div>

              {/* Arrow down to research agents */}
              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-3 bg-border" />
                <ArrowDown className="w-4 h-4" />
              </div>

              {/* 4 Research Agents */}
              <div className="flex flex-wrap justify-center gap-2 max-w-3xl">
                {researchAgents.map((agent) => (
                  <AgentBox key={agent.agentKey} agent={agent} onClick={() => handleAgentClick(agent)} />
                ))}
              </div>

              {/* Arrow down */}
              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="w-5 h-5" />
              </div>

              {/* Stage 4: Evaluation Pipeline */}
              <div className="text-center">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Stage 4: Evaluation Pipeline
                </div>
                {orchestrator && (
                  <AgentBox
                    agent={orchestrator}
                    onClick={() => handleAgentClick(orchestrator)}
                    size="large"
                  />
                )}
              </div>

              {/* Arrow down */}
              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-3 bg-border" />
                <ArrowDown className="w-4 h-4" />
              </div>

              {/* 11 Analysis Agents - Row 1 */}
              <div className="flex flex-wrap justify-center gap-2 max-w-4xl">
                {row1Agents.map((agent) => (
                  <AgentBox key={agent.agentKey} agent={agent} onClick={() => handleAgentClick(agent)} />
                ))}
              </div>

              {/* 11 Analysis Agents - Row 2 */}
              <div className="flex flex-wrap justify-center gap-2 max-w-4xl">
                {row2Agents.map((agent) => (
                  <AgentBox key={agent.agentKey} agent={agent} onClick={() => handleAgentClick(agent)} />
                ))}
              </div>

              {/* Arrow down */}
              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-3 bg-border" />
                <ArrowDown className="w-4 h-4" />
              </div>

              {/* Synthesis */}
              {synthesisAgent && (
                <AgentBox
                  agent={synthesisAgent}
                  onClick={() => handleAgentClick(synthesisAgent)}
                  size="large"
                />
              )}

              {/* Arrow down to Stage 5 */}
              {investorAgents.length > 0 && (
                <div className="flex flex-col items-center text-muted-foreground">
                  <div className="w-px h-4 bg-border" />
                  <ArrowDown className="w-5 h-5" />
                </div>
              )}

              {/* Stage 5: Investor Matching */}
              {investorAgents.length > 0 && (
                <div className="text-center">
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                    Stage 5: Investor Matching
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {investorAgents.map((agent) => (
                      <AgentBox key={agent.agentKey} agent={agent} onClick={() => handleAgentClick(agent)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <div className="w-3 h-3 rounded-full border-2 border-dashed border-amber-500 bg-transparent" />
              <span className="font-medium text-sm">Process (1-2)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Data extraction steps</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="font-medium text-sm">Research (3)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">o3-deep-research agents</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="font-medium text-sm">Orchestrator</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Coordinates evaluation</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="font-medium text-sm">Analysis (4)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">11 evaluation agents</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="font-medium text-sm">Synthesis</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Final memo & scoring</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="font-medium text-sm">Investor (5)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Thesis & alignment</p>
          </CardContent>
        </Card>
      </div>

      <AgentEditorPanel
        agent={selectedAgent}
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </div>
  );
}
