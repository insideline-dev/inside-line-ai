export interface ScoringWeights {
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

export function computeWeightedScore(sectionScores: Partial<SectionScores>, weights: ScoringWeights): number {
  const sections: (keyof SectionScores)[] = [
    'team', 'market', 'product', 'traction', 'businessModel',
    'gtm', 'financials', 'competitiveAdvantage', 'legal', 'dealTerms', 'exitPotential'
  ];

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

// Note: Weights should always be fetched from the database via /api/scoring-weights
// No hardcoded defaults - the database is the single source of truth
