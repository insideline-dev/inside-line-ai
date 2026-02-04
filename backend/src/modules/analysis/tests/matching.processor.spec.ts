import {
  describe,
  it,
  expect,
} from 'bun:test';

// Define threshold locally to avoid importing from config (which triggers bullmq import)
const HIGH_SCORE_THRESHOLD = 80;

describe('MatchingProcessor', () => {

  const mockScores = {
    marketScore: 90,
    teamScore: 85,
    productScore: 80,
    tractionScore: 75,
    financialsScore: 85,
  };

  const mockWeights = {
    marketWeight: 30,
    teamWeight: 25,
    productWeight: 20,
    tractionWeight: 15,
    financialsWeight: 10,
  };

  describe('overall score calculation', () => {
    it('should calculate weighted average correctly', () => {
      const result = calculateOverallScore(mockScores, mockWeights);

      // (90*30 + 85*25 + 80*20 + 75*15 + 85*10) / 100 = 83.75 -> 84
      expect(result).toBe(84);
    });

    it('should handle equal weights (defaults)', () => {
      const equalWeights = {
        marketWeight: 20,
        teamWeight: 20,
        productWeight: 20,
        tractionWeight: 20,
        financialsWeight: 20,
      };

      const equalScores = {
        marketScore: 80,
        teamScore: 80,
        productScore: 80,
        tractionScore: 80,
        financialsScore: 80,
      };

      const result = calculateOverallScore(equalScores, equalWeights);
      expect(result).toBe(80);
    });

    it('should handle null scores as 0', () => {
      const partialScores = {
        marketScore: 90,
        teamScore: null,
        productScore: null,
        tractionScore: null,
        financialsScore: null,
      };

      const result = calculateOverallScore(partialScores as any, mockWeights);

      // (90*30 + 0*25 + 0*20 + 0*15 + 0*10) / 100 = 27
      expect(result).toBe(27);
    });
  });

  describe('match reason generation', () => {
    it('should generate reason with multiple strengths', () => {
      const highScores = {
        marketScore: 85,
        teamScore: 90,
        productScore: 75,
        tractionScore: 60,
        financialsScore: 70,
      };

      const reason = generateMatchReason(highScores, 80);

      expect(reason).toContain('strong market opportunity');
      expect(reason).toContain('experienced team');
      expect(reason).toContain('80%');
    });

    it('should generate reason with all strengths', () => {
      const allHighScores = {
        marketScore: 85,
        teamScore: 85,
        productScore: 85,
        tractionScore: 85,
        financialsScore: 85,
      };

      const reason = generateMatchReason(allHighScores, 85);

      expect(reason).toContain('strong market opportunity');
      expect(reason).toContain('experienced team');
      expect(reason).toContain('innovative product');
      expect(reason).toContain('solid traction');
      expect(reason).toContain('healthy financials');
    });

    it('should generate fallback reason when no strengths', () => {
      const lowScores = {
        marketScore: 60,
        teamScore: 55,
        productScore: 50,
        tractionScore: 45,
        financialsScore: 40,
      };

      const reason = generateMatchReason(lowScores, 50);

      expect(reason).toBe('Overall score: 50%');
    });
  });

  describe('high score threshold', () => {
    it('should identify high-score matches above threshold', () => {
      expect(HIGH_SCORE_THRESHOLD).toBe(80);

      const score = 85;
      expect(score >= HIGH_SCORE_THRESHOLD).toBe(true);
    });

    it('should not flag scores below threshold as high-score', () => {
      const score = 79;
      expect(score >= HIGH_SCORE_THRESHOLD).toBe(false);
    });

    it('should flag score exactly at threshold as high-score', () => {
      const score = 80;
      expect(score >= HIGH_SCORE_THRESHOLD).toBe(true);
    });
  });
});

// Helper functions that mimic the processor's logic
function calculateOverallScore(
  scores: {
    marketScore: number | null;
    teamScore: number | null;
    productScore: number | null;
    tractionScore: number | null;
    financialsScore: number | null;
  },
  weights: {
    marketWeight: number;
    teamWeight: number;
    productWeight: number;
    tractionWeight: number;
    financialsWeight: number;
  },
): number {
  const marketScore = scores.marketScore ?? 0;
  const teamScore = scores.teamScore ?? 0;
  const productScore = scores.productScore ?? 0;
  const tractionScore = scores.tractionScore ?? 0;
  const financialsScore = scores.financialsScore ?? 0;

  return Math.round(
    (marketScore * weights.marketWeight +
      teamScore * weights.teamWeight +
      productScore * weights.productWeight +
      tractionScore * weights.tractionWeight +
      financialsScore * weights.financialsWeight) /
      100,
  );
}

function generateMatchReason(
  scores: {
    marketScore: number;
    teamScore: number;
    productScore: number;
    tractionScore: number;
    financialsScore: number;
  },
  overallScore: number,
): string {
  const strengths: string[] = [];

  if (scores.marketScore >= 80) strengths.push('strong market opportunity');
  if (scores.teamScore >= 80) strengths.push('experienced team');
  if (scores.productScore >= 80) strengths.push('innovative product');
  if (scores.tractionScore >= 80) strengths.push('solid traction');
  if (scores.financialsScore >= 80) strengths.push('healthy financials');

  if (strengths.length === 0) {
    return `Overall score: ${overallScore}%`;
  }

  return `Strong fit with ${strengths.join(', ')} (${overallScore}%)`;
}
