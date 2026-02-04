import { storage } from "./storage";
import type { ScoringWeights } from "@shared/schema";

export interface SectionScores {
  team: number;
  market: number;
  product: number;
  traction: number;
  businessModel: number;
  gtm: number;
  financials: number;
  competitiveAdvantage: number;
  legal: number;
  dealTerms: number;
  exitPotential: number;
}

// Note: All weights must come from the database (stage_scoring_weights table)
// No hardcoded defaults - the database is the single source of truth

export function computeWeightedScore(
  sectionScores: Partial<SectionScores>,
  weights: ScoringWeights
): number {
  const sections = [
    'team', 'market', 'product', 'traction', 'businessModel',
    'gtm', 'financials', 'competitiveAdvantage', 'legal', 'dealTerms', 'exitPotential'
  ] as const;
  
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const section of sections) {
    const score = sectionScores[section];
    const weight = weights[section];
    
    if (score !== undefined && score !== null && weight > 0) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }
  
  if (totalWeight === 0) return 0;
  
  return Math.round(weightedSum / totalWeight);
}

export async function getWeightsForStage(stage: string): Promise<ScoringWeights> {
  const stageWeights = await storage.getStageScoringWeights(stage);
  if (stageWeights?.weights) {
    console.log(`[ScoreComputation] Using DB weights for stage "${stage}":`, JSON.stringify(stageWeights.weights));
    return stageWeights.weights;
  }
  // Database weights are required - throw error if not found
  throw new Error(`[ScoreComputation] No weights found in database for stage "${stage}". Please seed the stage_scoring_weights table.`);
}

export async function computeStartupScore(
  sectionScores: Partial<SectionScores>,
  stage: string
): Promise<number> {
  const weights = await getWeightsForStage(stage);
  return computeWeightedScore(sectionScores, weights);
}

export async function computeStartupScoreWithInvestorPreferences(
  sectionScores: Partial<SectionScores>,
  stage: string,
  investorId: number
): Promise<{ score: number; usingCustomWeights: boolean; weights: ScoringWeights }> {
  const preference = await storage.getInvestorScoringPreference(investorId, stage);
  
  if (preference?.useCustomWeights && preference.customWeights) {
    return {
      score: computeWeightedScore(sectionScores, preference.customWeights),
      usingCustomWeights: true,
      weights: preference.customWeights
    };
  }
  
  const defaultWeights = await getWeightsForStage(stage);
  return {
    score: computeWeightedScore(sectionScores, defaultWeights),
    usingCustomWeights: false,
    weights: defaultWeights
  };
}

export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (total === 100) return weights;
  
  const factor = 100 / total;
  return {
    team: Math.round(weights.team * factor),
    market: Math.round(weights.market * factor),
    product: Math.round(weights.product * factor),
    traction: Math.round(weights.traction * factor),
    businessModel: Math.round(weights.businessModel * factor),
    gtm: Math.round(weights.gtm * factor),
    financials: Math.round(weights.financials * factor),
    competitiveAdvantage: Math.round(weights.competitiveAdvantage * factor),
    legal: Math.round(weights.legal * factor),
    dealTerms: Math.round(weights.dealTerms * factor),
    exitPotential: Math.round(weights.exitPotential * factor)
  };
}

export function validateWeights(weights: ScoringWeights): { valid: boolean; error?: string } {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  
  if (total !== 100) {
    return { valid: false, error: `Weights must sum to 100% (currently ${total}%)` };
  }
  
  for (const [key, value] of Object.entries(weights)) {
    if (value < 0) {
      return { valid: false, error: `Weight for ${key} cannot be negative` };
    }
    if (value > 100) {
      return { valid: false, error: `Weight for ${key} cannot exceed 100%` };
    }
  }
  
  return { valid: true };
}
