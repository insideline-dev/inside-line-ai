import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  ExternalLink,
  Globe,
  Linkedin,
  Sparkles,
  FileText,
} from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

interface SourceLike {
  name?: string;
  title?: string;
  url?: string;
  type?: string;
  category?: string;
  agent?: string;
  model?: string;
  timestamp?: string;
  relevance?: string;
}

interface SourcesTabContentProps {
  startup: Startup;
  evaluation: Evaluation | null;
}

const AGENT_LABEL: Record<string, string> = {
  team: "TeamDeepResearch",
  market: "MarketDeepResearch",
  product: "ProductDeepResearch",
  news: "NewsDeepResearch",
};

const AI_AGENT_ROWS = [
  { key: "team", label: "TeamAgent", description: "Team composition and founder-market fit analysis", scoreKey: "teamScore" },
  { key: "market", label: "MarketAgent", description: "Market opportunity and TAM/SAM/SOM analysis", scoreKey: "marketScore" },
  { key: "product", label: "ProductAgent", description: "Product quality and defensibility analysis", scoreKey: "productScore" },
  { key: "traction", label: "TractionAgent", description: "Growth trajectory and validation analysis", scoreKey: "tractionScore" },
  { key: "businessModel", label: "BusinessModelAgent", description: "Business model and unit economics analysis", scoreKey: "businessModelScore" },
  { key: "gtm", label: "GtmAgent", description: "Go-to-market strategy analysis", scoreKey: "gtmScore" },
  { key: "financials", label: "FinancialsAgent", description: "Financial health and runway analysis", scoreKey: "financialsScore" },
  { key: "competitiveAdvantage", label: "CompetitiveAdvantageAgent", description: "Competitive moat and positioning analysis", scoreKey: "competitiveAdvantageScore" },
  { key: "legal", label: "LegalRegulatoryAgent", description: "Legal, regulatory and IP analysis", scoreKey: "legalScore" },
  { key: "dealTerms", label: "DealTermsAgent", description: "Deal terms and valuation analysis", scoreKey: "dealTermsScore" },
  { key: "exitPotential", label: "ExitPotentialAgent", description: "Exit potential and M&A analysis", scoreKey: "exitPotentialScore" },
  { key: "synthesis", label: "SynthesisAgent", description: "Final synthesis and investor memo generation", scoreKey: "overallScore" },
] as const;

type AiAgentRowKey = (typeof AI_AGENT_ROWS)[number]["key"];

const SOURCE_AGENT_TO_ROW_KEY: Record<string, AiAgentRowKey> = {
  team: "team",
  teamagent: "team",
  market: "market",
  marketagent: "market",
  product: "product",
  productagent: "product",
  traction: "traction",
  tractionagent: "traction",
  businessmodel: "businessModel",
  businessmodelagent: "businessModel",
  gtm: "gtm",
  gtmagent: "gtm",
  financials: "financials",
  financialsagent: "financials",
  competitiveadvantage: "competitiveAdvantage",
  competitiveadvantageagent: "competitiveAdvantage",
  legal: "legal",
  legalregulatoryagent: "legal",
  dealterms: "dealTerms",
  dealtermsagent: "dealTerms",
  exitpotential: "exitPotential",
  exitpotentialagent: "exitPotential",
  synthesis: "synthesis",
  synthesisagent: "synthesis",
};

function formatDate(value?: string): string {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

function getSourceAgentLabel(agent?: string): string {
  if (!agent) return "Orchestrator";
  return AGENT_LABEL[agent] || "Orchestrator";
}

function toAiAgentRowKey(agent?: string): AiAgentRowKey | null {
  if (!agent) return null;
  const normalized = agent.toLowerCase().replace(/[^a-z]/g, "");
  return SOURCE_AGENT_TO_ROW_KEY[normalized] ?? null;
}

function sectionTitleClass() {
  return "text-base flex items-center gap-2";
}

function SourceRow({
  url,
  title,
  subtitle,
  agentLabel,
  timestamp,
}: {
  url?: string;
  title: string;
  subtitle?: string;
  agentLabel: string;
  timestamp?: string;
}) {
  return (
    <div className="rounded-md bg-muted/25 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all text-sm font-medium text-violet-600 hover:underline"
            >
              {title}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <p className="break-all text-sm font-medium">{title}</p>
          )}
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{formatDate(timestamp)}</p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[11px]">
          {agentLabel}
        </Badge>
      </div>
    </div>
  );
}

export function SourcesTabContent({ startup, evaluation }: SourcesTabContentProps) {
  const allSources = (evaluation?.sources as unknown as SourceLike[]) || [];
  const rawSources = allSources.filter((item) => Boolean(item?.url));

  const modelByAgent = allSources.reduce(
    (acc, source) => {
      const sourceType = (source.type || "").toLowerCase();
      const sourceCategory = (source.category || "").toLowerCase();
      const isApiSource =
        sourceType === "api" ||
        sourceCategory === "api" ||
        typeof source.model === "string";

      if (!isApiSource) return acc;

      const agentKey = toAiAgentRowKey(source.agent);
      if (!agentKey) return acc;

      const model =
        (typeof source.model === "string" && source.model.trim()) ||
        (typeof source.name === "string" && source.name.trim()) ||
        "";

      if (!model) return acc;

      acc[agentKey] = model;
      return acc;
    },
    {} as Partial<Record<AiAgentRowKey, string>>,
  );

  const websiteSources = [
    ...(startup.website
      ? [
          {
            url: startup.website,
            title: startup.website,
            subtitle: "Company website",
            agentLabel: "Orchestrator",
            timestamp: startup.updatedAt || startup.createdAt,
          },
        ]
      : []),
    ...rawSources.map((source) => ({
      url: source.url,
      title: source.name || source.title || source.url || "Source",
      subtitle: source.relevance || source.type || "Research source",
      agentLabel: getSourceAgentLabel(source.agent),
      timestamp: source.timestamp || evaluation?.updatedAt || evaluation?.createdAt,
    })),
  ];

  const linkedinRows = (
    ((evaluation?.teamMemberEvaluations as unknown as Array<Record<string, unknown>>) || [])
      .map((member) => ({
        name: String(member.name || "Unknown"),
        role: String(member.role || "Team member"),
        linkedinUrl: typeof member.linkedinUrl === "string" ? member.linkedinUrl : undefined,
      }))
      .filter((member) => Boolean(member.linkedinUrl))
  ).filter(
    (member, idx, arr) =>
      arr.findIndex((m) => m.linkedinUrl?.toLowerCase() === member.linkedinUrl?.toLowerCase()) === idx,
  );

  const aiAgentRows = AI_AGENT_ROWS.map((row) => {
    const score =
      row.scoreKey === "overallScore"
        ? evaluation?.overallScore
        : (evaluation as Record<string, unknown> | null)?.[row.scoreKey];

    return {
      ...row,
      score: typeof score === "number" ? Math.round(score) : null,
      model: modelByAgent[row.key] || "Model unavailable",
    };
  }).filter((row) => row.score !== null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className={sectionTitleClass()}>
            <FileText className="h-4 w-4" />
            Data Sources
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            All sources used by AI agents to generate this evaluation
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className={sectionTitleClass()}>
            <Globe className="h-4 w-4 text-green-600" />
            Websites
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {websiteSources.length > 0 ? (
            websiteSources.map((row, idx) => (
              <SourceRow
                key={`${row.url}-${idx}`}
                url={row.url}
                title={row.title || "Website source"}
                subtitle={row.subtitle}
                agentLabel={row.agentLabel}
                timestamp={row.timestamp}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No website sources found.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className={sectionTitleClass()}>
            <Linkedin className="h-4 w-4 text-indigo-600" />
            LinkedIn Profiles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {linkedinRows.length > 0 ? (
            linkedinRows.map((row, idx) => (
              <SourceRow
                key={`${row.linkedinUrl}-${idx}`}
                url={row.linkedinUrl}
                title={`LinkedIn: ${row.name}`}
                subtitle={`Profile data retrieved for ${row.role}`}
                agentLabel="TeamAgent"
                timestamp={evaluation?.updatedAt || evaluation?.createdAt}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No LinkedIn profiles found.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className={sectionTitleClass()}>
            <Sparkles className="h-4 w-4 text-violet-500" />
            AI Analysis Agents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiAgentRows.map((row) => (
            <div key={row.key} className="rounded-md bg-muted/25 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.description}</p>
                  <p className="mt-1 text-xs font-medium">
                    {row.key === "synthesis" ? "Percentile" : "Score"}: {row.score}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(evaluation?.updatedAt || evaluation?.createdAt)}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[11px]">
                  {row.model}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className={sectionTitleClass()}>
            <Database className="h-4 w-4 text-orange-500" />
            Database Records
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted/25 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">startups</p>
                <p className="text-xs text-muted-foreground">Retrieved startup record: {startup.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">ID: {startup.id}, Name: {startup.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(startup.updatedAt || startup.createdAt)}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0 text-[11px]">
                Orchestrator
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
