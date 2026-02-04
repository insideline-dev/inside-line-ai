export interface StartupScores {
  marketScore: number;
  teamScore: number;
  productScore: number;
  tractionScore: number;
  financialsScore: number;
}

export interface ScoringWeights {
  marketWeight: number;
  teamWeight: number;
  productWeight: number;
  tractionWeight: number;
  financialsWeight: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  marketWeight: 20,
  teamWeight: 20,
  productWeight: 20,
  tractionWeight: 20,
  financialsWeight: 20,
};
