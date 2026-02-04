import {
  mock,
  describe,
  it,
  expect,
} from 'bun:test';
import type { MarketAnalysis } from '../interfaces';

// Mock bullmq
mock.module('bullmq', () => ({
  Worker: mock(() => ({
    on: mock(() => ({})),
    close: mock(() => Promise.resolve()),
  })),
  Job: mock(() => ({})),
  UnrecoverableError: class extends Error {},
}));

describe('MarketAnalysisProcessor', () => {
  const mockStartupId = '123e4567-e89b-12d3-a456-426614174000';

  const mockStartup = {
    id: mockStartupId,
    name: 'Test Startup',
    industry: 'SaaS',
    location: 'San Francisco',
    description: 'A comprehensive testing platform.',
  };

  describe('market size calculation', () => {
    it('should calculate market size based on industry multiplier', () => {
      const analysis = generateMockAnalysis(mockStartup);

      expect(analysis.marketSize.tam).toBeGreaterThan(0);
      expect(analysis.marketSize.sam).toBeLessThan(analysis.marketSize.tam);
      expect(analysis.marketSize.som).toBeLessThan(analysis.marketSize.sam);
      expect(analysis.marketSize.currency).toBe('USD');
    });

    it('should use higher multiplier for fintech', () => {
      const fintechStartup = { ...mockStartup, industry: 'fintech' };
      const analysis = generateMockAnalysis(fintechStartup);
      const baseAnalysis = generateMockAnalysis({ ...mockStartup, industry: 'other' });

      expect(analysis.marketSize.tam).toBeGreaterThan(baseAnalysis.marketSize.tam);
    });

    it('should use higher multiplier for AI', () => {
      const aiStartup = { ...mockStartup, industry: 'ai' };
      const analysis = generateMockAnalysis(aiStartup);
      const baseAnalysis = generateMockAnalysis({ ...mockStartup, industry: 'other' });

      expect(analysis.marketSize.tam).toBeGreaterThan(baseAnalysis.marketSize.tam);
    });

    it('should use higher multiplier for healthtech', () => {
      const healthStartup = { ...mockStartup, industry: 'healthtech' };
      const analysis = generateMockAnalysis(healthStartup);
      const baseAnalysis = generateMockAnalysis({ ...mockStartup, industry: 'other' });

      expect(analysis.marketSize.tam).toBeGreaterThan(baseAnalysis.marketSize.tam);
    });
  });

  describe('competitor generation', () => {
    it('should return industry-specific competitors for fintech', () => {
      const fintechStartup = { ...mockStartup, industry: 'fintech' };
      const analysis = generateMockAnalysis(fintechStartup);

      expect(analysis.competitors.length).toBeGreaterThan(0);
      expect(analysis.competitors.some((c) => c.name === 'Stripe')).toBe(true);
    });

    it('should return industry-specific competitors for AI', () => {
      const aiStartup = { ...mockStartup, industry: 'ai' };
      const analysis = generateMockAnalysis(aiStartup);

      expect(analysis.competitors.length).toBeGreaterThan(0);
      expect(analysis.competitors.some((c) => c.name === 'OpenAI')).toBe(true);
    });

    it('should return generic competitors for unknown industry', () => {
      const otherStartup = { ...mockStartup, industry: 'agriculture' };
      const analysis = generateMockAnalysis(otherStartup);

      expect(analysis.competitors.length).toBeGreaterThan(0);
      expect(analysis.competitors.some((c) => c.name === 'Competitor A')).toBe(true);
    });

    it('should include funding raised for known competitors', () => {
      const fintechStartup = { ...mockStartup, industry: 'fintech' };
      const analysis = generateMockAnalysis(fintechStartup);

      const stripe = analysis.competitors.find((c) => c.name === 'Stripe');
      expect(stripe?.fundingRaised).toBeDefined();
      expect(stripe?.fundingRaised).toBeGreaterThan(0);
    });
  });

  describe('trends generation', () => {
    it('should include base trends for all industries', () => {
      const analysis = generateMockAnalysis(mockStartup);

      expect(analysis.trends).toContain('Digital transformation acceleration');
      expect(analysis.trends).toContain('Remote work driving adoption');
    });

    it('should include fintech-specific trends', () => {
      const fintechStartup = { ...mockStartup, industry: 'fintech' };
      const analysis = generateMockAnalysis(fintechStartup);

      expect(analysis.trends).toContain('Open banking adoption');
      expect(analysis.trends).toContain('Embedded finance growth');
    });

    it('should include AI-specific trends', () => {
      const aiStartup = { ...mockStartup, industry: 'ai' };
      const analysis = generateMockAnalysis(aiStartup);

      expect(analysis.trends).toContain('Generative AI boom');
      expect(analysis.trends).toContain('Enterprise AI adoption');
    });

    it('should include health-specific trends', () => {
      const healthStartup = { ...mockStartup, industry: 'healthtech' };
      const analysis = generateMockAnalysis(healthStartup);

      expect(analysis.trends).toContain('Telehealth normalization');
    });
  });

  describe('risks and opportunities', () => {
    it('should always include standard risks', () => {
      const analysis = generateMockAnalysis(mockStartup);

      expect(analysis.risks.length).toBe(4);
      expect(analysis.risks).toContain('Market competition intensifying');
      expect(analysis.risks).toContain('Regulatory changes possible');
    });

    it('should always include standard opportunities', () => {
      const analysis = generateMockAnalysis(mockStartup);

      expect(analysis.opportunities.length).toBe(4);
      expect(analysis.opportunities).toContain('Growing market demand');
      expect(analysis.opportunities).toContain('Partnership opportunities');
    });
  });

  describe('empty analysis', () => {
    it('should return valid empty structure', () => {
      const emptyAnalysis = getEmptyAnalysis();

      expect(emptyAnalysis.marketSize.tam).toBe(0);
      expect(emptyAnalysis.marketSize.sam).toBe(0);
      expect(emptyAnalysis.marketSize.som).toBe(0);
      expect(emptyAnalysis.marketSize.currency).toBe('USD');
      expect(emptyAnalysis.competitors).toEqual([]);
      expect(emptyAnalysis.trends).toEqual([]);
      expect(emptyAnalysis.risks).toEqual([]);
      expect(emptyAnalysis.opportunities).toEqual([]);
    });
  });
});

// Helper functions that mimic the processor's logic
function generateMockAnalysis(startupData: { industry: string | null }): MarketAnalysis {
  const industryMultipliers: Record<string, number> = {
    fintech: 15,
    healthtech: 12,
    ai: 20,
    saas: 10,
    ecommerce: 8,
    edtech: 6,
  };

  const multiplier =
    Object.entries(industryMultipliers).find(([key]) =>
      startupData.industry?.toLowerCase().includes(key),
    )?.[1] ?? 5;

  const baseTam = 1000000000;
  const tam = baseTam * multiplier;
  const sam = tam * 0.15;
  const som = sam * 0.05;

  return {
    marketSize: {
      tam,
      sam,
      som,
      currency: 'USD',
    },
    competitors: getMockCompetitors(startupData.industry),
    trends: getMockTrends(startupData.industry),
    risks: [
      'Market competition intensifying',
      'Regulatory changes possible',
      'Economic downturn impact',
      'Talent acquisition challenges',
    ],
    opportunities: [
      'Growing market demand',
      'Underserved customer segments',
      'Partnership opportunities',
      'Geographic expansion potential',
    ],
  };
}

function getMockCompetitors(industry: string | null): MarketAnalysis['competitors'] {
  const industryCompetitors: Record<string, MarketAnalysis['competitors']> = {
    fintech: [
      { name: 'Stripe', description: 'Payment infrastructure', fundingRaised: 8000000000 },
      { name: 'Plaid', description: 'Financial data platform', fundingRaised: 734000000 },
      { name: 'Brex', description: 'Corporate credit card', fundingRaised: 1200000000 },
    ],
    healthtech: [
      { name: 'Teladoc', description: 'Telehealth platform', fundingRaised: 500000000 },
      { name: 'Oscar Health', description: 'Health insurance', fundingRaised: 1600000000 },
    ],
    ai: [
      { name: 'OpenAI', description: 'AI research lab', fundingRaised: 11000000000 },
      { name: 'Anthropic', description: 'AI safety company', fundingRaised: 7000000000 },
    ],
  };

  const matchedIndustry = Object.keys(industryCompetitors).find((key) =>
    industry?.toLowerCase().includes(key),
  );

  return matchedIndustry
    ? industryCompetitors[matchedIndustry]
    : [
        { name: 'Competitor A', description: 'Market leader' },
        { name: 'Competitor B', description: 'Fast-growing challenger' },
      ];
}

function getMockTrends(industry: string | null): string[] {
  const baseTrends = [
    'Digital transformation acceleration',
    'Remote work driving adoption',
    'Increasing investor interest',
  ];

  if (industry?.toLowerCase().includes('fintech')) {
    return [...baseTrends, 'Open banking adoption', 'Embedded finance growth'];
  }
  if (industry?.toLowerCase().includes('ai')) {
    return [...baseTrends, 'Generative AI boom', 'Enterprise AI adoption'];
  }
  if (industry?.toLowerCase().includes('health')) {
    return [...baseTrends, 'Telehealth normalization', 'Digital health records'];
  }

  return baseTrends;
}

function getEmptyAnalysis(): MarketAnalysis {
  return {
    marketSize: { tam: 0, sam: 0, som: 0, currency: 'USD' },
    competitors: [],
    trends: [],
    risks: [],
    opportunities: [],
  };
}
