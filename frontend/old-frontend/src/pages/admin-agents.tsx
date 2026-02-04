import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  Search,
  Newspaper,
  Layers,
  FileText,
  Handshake
} from "lucide-react";
import type { AgentPrompt } from "@shared/schema";

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

const categoryColors: Record<string, string> = {
  orchestrator: "bg-purple-500/10 border-purple-500/50 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20",
  analysis: "bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20",
  synthesis: "bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-300 hover:bg-green-500/20",
  extraction: "bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20",
  research: "bg-orange-500/10 border-orange-500/50 text-orange-700 dark:text-orange-300 hover:bg-orange-500/20",
  investor: "bg-indigo-500/10 border-indigo-500/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20",
};

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

function AgentBox({ 
  agent, 
  onClick,
  size = "normal"
}: { 
  agent: AgentPrompt; 
  onClick: () => void;
  size?: "normal" | "large";
}) {
  const Icon = agentIcons[agent.agentKey] || Bot;
  const colorClass = categoryColors[agent.category] || categoryColors.analysis;
  
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
    const allText = agent.systemPrompt + " " + agent.humanPrompt;
    const matches = allText.match(/\{([^}]+)\}/g) || [];
    return Array.from(new Set(matches.map(m => m.slice(1, -1))));
  }, [agent]);
  
  useEffect(() => {
    if (agent) {
      setSystemPrompt(agent.systemPrompt);
      setHumanPrompt(agent.humanPrompt);
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
    humanPrompt !== agent.humanPrompt || 
    description !== (agent.description || "");

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {(() => {
              const Icon = agentIcons[agent.agentKey] || Bot;
              return <Icon className="w-5 h-5" />;
            })()}
            {agent.displayName}
          </SheetTitle>
          <SheetDescription>
            Edit the prompts and configuration for this agent
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="prompts" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="prompts" data-testid="tab-prompts">Prompts</TabsTrigger>
            <TabsTrigger value="io" data-testid="tab-io">Inputs/Outputs</TabsTrigger>
            <TabsTrigger value="preview" data-testid="tab-preview">Preview</TabsTrigger>
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
                  Variables in curly braces (e.g., {"{companyName}"}) will be replaced with actual values at runtime.
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
                  {agent.inputs?.map((input: any, index: number) => (
                    <div key={index} className="flex items-start gap-2 p-2 bg-muted/50 rounded-md">
                      <Badge variant={input.required ? "default" : "secondary"} className="text-xs">
                        {input.key}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{input.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileOutput className="w-4 h-4" />
                  Outputs
                </Label>
                <div className="space-y-2">
                  {agent.outputs?.map((output: any, index: number) => (
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
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  Tools
                </Label>
                <div className="flex flex-wrap gap-1">
                  {agent.tools?.map((tool: string) => (
                    <Badge key={tool} variant="outline">
                      {tool}
                    </Badge>
                  ))}
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
              <Button 
                onClick={handleSave} 
                disabled={!hasChanges || isSaving}
                data-testid="button-save"
              >
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

export default function AdminAgentsPage() {
  const { toast } = useToast();
  const [selectedAgent, setSelectedAgent] = useState<AgentPrompt | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const { data: agents, isLoading } = useQuery<AgentPrompt[]>({
    queryKey: ["/api/admin/agents"],
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/agents/seed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] });
      toast({
        title: "Agents initialized",
        description: "Default agent prompts have been created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to initialize agents",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ agentKey, updates }: { agentKey: string; updates: Partial<AgentPrompt> }) => {
      return apiRequest("PUT", `/api/admin/agents/${agentKey}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] });
      setIsPanelOpen(false);
      toast({
        title: "Agent updated",
        description: "The agent prompt has been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update agent",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAgentClick = (agent: AgentPrompt) => {
    setSelectedAgent(agent);
    setIsPanelOpen(true);
  };

  const handleSave = (updates: Partial<AgentPrompt>) => {
    if (selectedAgent) {
      updateMutation.mutate({ agentKey: selectedAgent.agentKey, updates });
    }
  };

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

  const noAgents = !agents || agents.length === 0;
  
  // Check if research pipeline agents are missing (only Stage 3+ agents have prompts)
  const expectedResearchAgents = ["researchOrchestrator", "teamDeepResearch", "marketDeepResearch", "productDeepResearch", "newsSearch"];
  const expectedInvestorAgents = ["investorThesis", "thesisAlignment"];
  const existingAgentKeys = new Set(agents?.map(a => a.agentKey) || []);
  const missingResearchAgents = expectedResearchAgents.filter(key => !existingAgentKeys.has(key));
  const missingInvestorAgents = expectedInvestorAgents.filter(key => !existingAgentKeys.has(key));
  const totalMissingAgents = missingResearchAgents.length + missingInvestorAgents.length;
  
  // Stage 3: Research Orchestrator + 4 Research Agents (specific agent keys)
  const researchOrchestrator = agents?.find(a => a.agentKey === "researchOrchestrator");
  const researchAgentKeys = ["teamDeepResearch", "marketDeepResearch", "productDeepResearch", "newsSearch"];
  const researchAgents = agents?.filter(a => researchAgentKeys.includes(a.agentKey)) || [];
  
  // Stage 4: Evaluation Orchestrator + 11 Analysis Agents + Synthesis
  const orchestrator = agents?.find(a => a.agentKey === "orchestrator");
  const analysisAgents = agents?.filter(a => a.category === "analysis") || [];
  const synthesisAgent = agents?.find(a => a.agentKey === "synthesis");
  
  // Stage 5: Investor Matching Agents
  const investorAgents = agents?.filter(a => a.category === "investor") || [];

  // Split analysis agents into two rows
  const row1Agents = analysisAgents.slice(0, 6);
  const row2Agents = analysisAgents.slice(6);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Agent Prompts</h1>
          <p className="text-muted-foreground">
            View and edit the AI agents that analyze startups. Click on any agent to edit its prompts.
          </p>
        </div>
        <div className="flex gap-2">
          {noAgents && (
            <Button 
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="button-seed-agents"
            >
              {seedMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Initialize Agents
            </Button>
          )}
          {!noAgents && totalMissingAgents > 0 && (
            <Button 
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="button-sync-agents"
            >
              {seedMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Sync Missing Agents ({totalMissingAgents})
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
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Stage 1: Data Extraction</div>
                <div className="flex gap-3 justify-center">
                  <div className="px-4 py-3 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <FileSearch className="w-5 h-5" />
                      <span className="font-medium">Document Parsing</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Extract text from pitch deck</p>
                  </div>
                  <div className="px-4 py-3 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <Globe className="w-5 h-5" />
                      <span className="font-medium">Website Scraping</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Deep scrape up to 20 pages</p>
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
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Stage 2: Team LinkedIn Research</div>
                <div className="px-4 py-3 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <Linkedin className="w-5 h-5" />
                    <span className="font-medium">LinkedIn Enrichment</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Discover team members & fetch profiles via Unipile</p>
                </div>
              </div>

              {/* Arrow down */}
              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="w-5 h-5" />
              </div>

              {/* Stage 3: Research Orchestrator + 4 Research Agents */}
              <div className="text-center">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Stage 3: Deep Research</div>
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
                  <AgentBox 
                    key={agent.agentKey}
                    agent={agent} 
                    onClick={() => handleAgentClick(agent)}
                  />
                ))}
              </div>

              {/* Arrow down */}
              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="w-5 h-5" />
              </div>

              {/* Stage 4: Evaluation Pipeline */}
              <div className="text-center">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Stage 4: Evaluation Pipeline</div>
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
                  <AgentBox 
                    key={agent.agentKey}
                    agent={agent} 
                    onClick={() => handleAgentClick(agent)}
                  />
                ))}
              </div>

              {/* 11 Analysis Agents - Row 2 */}
              <div className="flex flex-wrap justify-center gap-2 max-w-4xl">
                {row2Agents.map((agent) => (
                  <AgentBox 
                    key={agent.agentKey}
                    agent={agent} 
                    onClick={() => handleAgentClick(agent)}
                  />
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
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Stage 5: Investor Matching</div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {investorAgents.map((agent) => (
                      <AgentBox 
                        key={agent.agentKey}
                        agent={agent} 
                        onClick={() => handleAgentClick(agent)}
                      />
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
            <p className="text-xs text-muted-foreground mt-1">
              Data extraction steps
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="font-medium text-sm">Research (3)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              o3-deep-research agents
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="font-medium text-sm">Orchestrator</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Coordinates evaluation
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="font-medium text-sm">Analysis (4)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              11 evaluation agents
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="font-medium text-sm">Synthesis</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Final memo & scoring
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="font-medium text-sm">Investor (5)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Thesis & alignment
            </p>
          </CardContent>
        </Card>
      </div>

      <AgentEditorPanel
        agent={selectedAgent}
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onSave={handleSave}
        isSaving={updateMutation.isPending}
      />
    </div>
  );
}
