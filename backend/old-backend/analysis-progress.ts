import { storage } from "./storage";

export interface StageProgress {
  stage: number;
  label: string;
  status: "pending" | "running" | "completed";
  startedAt?: string;
  completedAt?: string;
}

export interface AnalysisProgress {
  currentStage: number;
  currentStageLabel: string;
  completedAgents: string[];
  currentAgent: string | null;
  runningAgents: string[];
  // Deep research agent tracking (Stage 3)
  deepResearchAgents: string[];
  completedDeepResearchAgents: string[];
  runningDeepResearchAgents: string[];
  startedAt: string;
  lastUpdatedAt: string;
  stageProgress: StageProgress[];
}

const STAGES: { stage: number; label: string }[] = [
  { stage: 1, label: "Extracting pitch deck" },
  { stage: 2, label: "Scraping company website" },
  { stage: 3, label: "Deep research agents" },
  { stage: 4, label: "AI evaluation" },
  { stage: 5, label: "Final synthesis" },
];

// AI Evaluation agents (Stage 4)
const AGENT_IDS = [
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
];

// Deep Research agents (Stage 3)
export const DEEP_RESEARCH_AGENT_IDS = [
  "teamResearch",
  "marketResearch",
  "productResearch",
  "newsResearch",
];

async function getEvaluationId(startupId: number): Promise<number | null> {
  const evaluation = await storage.getEvaluation(startupId);
  return evaluation?.id || null;
}

export async function initializeProgress(startupId: number): Promise<void> {
  const now = new Date().toISOString();
  const progress: AnalysisProgress = {
    currentStage: 1,
    currentStageLabel: STAGES[0].label,
    completedAgents: [],
    currentAgent: null,
    runningAgents: [],
    // Deep research agent tracking
    deepResearchAgents: DEEP_RESEARCH_AGENT_IDS,
    completedDeepResearchAgents: [],
    runningDeepResearchAgents: [],
    startedAt: now,
    lastUpdatedAt: now,
    stageProgress: STAGES.map(s => ({
      stage: s.stage,
      label: s.label,
      status: s.stage === 1 ? "running" : "pending",
      startedAt: s.stage === 1 ? now : undefined,
    })),
  };
  
  const evalId = await getEvaluationId(startupId);
  if (evalId) {
    await storage.updateEvaluation(evalId, { analysisProgress: progress });
  }
}

export async function updateStage(startupId: number, stage: number): Promise<void> {
  const evaluation = await storage.getEvaluation(startupId);
  if (!evaluation) return;
  
  const progress = (evaluation.analysisProgress as AnalysisProgress) || {
    currentStage: 1,
    currentStageLabel: "",
    completedAgents: [],
    currentAgent: null,
    runningAgents: [],
    deepResearchAgents: DEEP_RESEARCH_AGENT_IDS,
    completedDeepResearchAgents: [],
    runningDeepResearchAgents: [],
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    stageProgress: STAGES.map(s => ({
      stage: s.stage,
      label: s.label,
      status: "pending" as const,
    })),
  };
  
  const now = new Date().toISOString();
  
  progress.stageProgress = progress.stageProgress.map(s => {
    if (s.stage < stage) {
      return { ...s, status: "completed" as const, completedAt: s.completedAt || now };
    } else if (s.stage === stage) {
      return { ...s, status: "running" as const, startedAt: now };
    }
    return s;
  });
  
  progress.currentStage = stage;
  progress.currentStageLabel = STAGES.find(s => s.stage === stage)?.label || "";
  progress.lastUpdatedAt = now;
  
  await storage.updateEvaluation(evaluation.id, { analysisProgress: progress });
}

export async function startAgent(startupId: number, agentId: string): Promise<void> {
  const evaluation = await storage.getEvaluation(startupId);
  if (!evaluation?.analysisProgress) return;
  
  const progress = evaluation.analysisProgress as AnalysisProgress;
  progress.currentAgent = agentId;
  
  // Track multiple running agents
  if (!progress.runningAgents) {
    progress.runningAgents = [];
  }
  if (!progress.runningAgents.includes(agentId)) {
    progress.runningAgents.push(agentId);
  }
  
  progress.lastUpdatedAt = new Date().toISOString();
  
  await storage.updateEvaluation(evaluation.id, { analysisProgress: progress });
}

export async function completeAgent(startupId: number, agentId: string): Promise<void> {
  const evaluation = await storage.getEvaluation(startupId);
  if (!evaluation?.analysisProgress) return;
  
  const progress = evaluation.analysisProgress as AnalysisProgress;
  
  if (!progress.completedAgents.includes(agentId)) {
    progress.completedAgents.push(agentId);
  }
  
  // Remove from running agents
  if (progress.runningAgents) {
    progress.runningAgents = progress.runningAgents.filter(id => id !== agentId);
  }
  
  if (progress.currentAgent === agentId) {
    progress.currentAgent = null;
  }
  
  progress.lastUpdatedAt = new Date().toISOString();
  
  await storage.updateEvaluation(evaluation.id, { analysisProgress: progress });
}

export async function completeAnalysis(startupId: number): Promise<void> {
  const evaluation = await storage.getEvaluation(startupId);
  if (!evaluation?.analysisProgress) return;
  
  const progress = evaluation.analysisProgress as AnalysisProgress;
  const now = new Date().toISOString();
  
  progress.stageProgress = progress.stageProgress.map(s => ({
    ...s,
    status: "completed" as const,
    completedAt: s.completedAt || now,
  }));
  
  progress.currentStage = 5;
  progress.currentStageLabel = "Complete";
  progress.currentAgent = null;
  progress.runningAgents = [];
  progress.lastUpdatedAt = now;
  
  await storage.updateEvaluation(evaluation.id, { analysisProgress: progress });
}

export async function startAllAgents(startupId: number): Promise<void> {
  const evaluation = await storage.getEvaluation(startupId);
  if (!evaluation?.analysisProgress) return;
  
  const progress = evaluation.analysisProgress as AnalysisProgress;
  progress.runningAgents = [...AGENT_IDS];
  progress.lastUpdatedAt = new Date().toISOString();
  
  await storage.updateEvaluation(evaluation.id, { analysisProgress: progress });
}

// Deep Research Agent Progress Tracking (Stage 3)

// Start all deep research agents at once (avoids race condition when starting in parallel)
export async function startAllDeepResearchAgents(startupId: number): Promise<void> {
  const evaluation = await storage.getEvaluation(startupId);
  if (!evaluation?.analysisProgress) return;
  
  const progress = evaluation.analysisProgress as AnalysisProgress;
  
  // Mark all deep research agents as running at once
  progress.runningDeepResearchAgents = [...DEEP_RESEARCH_AGENT_IDS];
  progress.lastUpdatedAt = new Date().toISOString();
  
  await storage.updateEvaluation(evaluation.id, { analysisProgress: progress });
}

export async function startDeepResearchAgent(startupId: number, agentId: string): Promise<void> {
  const evaluation = await storage.getEvaluation(startupId);
  if (!evaluation?.analysisProgress) return;
  
  const progress = evaluation.analysisProgress as AnalysisProgress;
  
  if (!progress.runningDeepResearchAgents) {
    progress.runningDeepResearchAgents = [];
  }
  if (!progress.runningDeepResearchAgents.includes(agentId)) {
    progress.runningDeepResearchAgents.push(agentId);
  }
  
  progress.lastUpdatedAt = new Date().toISOString();
  
  await storage.updateEvaluation(evaluation.id, { analysisProgress: progress });
}

export async function completeDeepResearchAgent(startupId: number, agentId: string): Promise<void> {
  const evaluation = await storage.getEvaluation(startupId);
  if (!evaluation?.analysisProgress) return;
  
  const progress = evaluation.analysisProgress as AnalysisProgress;
  
  if (!progress.completedDeepResearchAgents) {
    progress.completedDeepResearchAgents = [];
  }
  if (!progress.completedDeepResearchAgents.includes(agentId)) {
    progress.completedDeepResearchAgents.push(agentId);
  }
  
  // Remove from running agents
  if (progress.runningDeepResearchAgents) {
    progress.runningDeepResearchAgents = progress.runningDeepResearchAgents.filter(id => id !== agentId);
  }
  
  progress.lastUpdatedAt = new Date().toISOString();
  
  await storage.updateEvaluation(evaluation.id, { analysisProgress: progress });
}

export async function wrapAgentCall<T>(
  startupId: number,
  agentId: string,
  agentPromise: Promise<T>
): Promise<T> {
  // Note: startAllAgents should be called before Promise.all
  // This function now only handles completion
  const result = await agentPromise;
  await completeAgent(startupId, agentId);
  return result;
}
