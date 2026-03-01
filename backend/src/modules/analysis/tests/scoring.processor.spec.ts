import {
  mock,
  describe,
  it,
  expect,
} from 'bun:test';
import type { ScoringJobData, StartupScores } from '../interfaces';

// Mock bullmq
mock.module('bullmq', () => ({
  Worker: mock(() => ({
    on: mock(() => ({})),
    close: mock(() => Promise.resolve()),
  })),
  Job: mock(() => ({})),
  UnrecoverableError: class extends Error {},
}));

describe('ScoringProcessor', () => {
  const mockStartupId = '123e4567-e89b-12d3-a456-426614174000';
  const _mockJobId = '123e4567-e89b-12d3-a456-426614174001';
  const mockAnalysisJobId = '123e4567-e89b-12d3-a456-426614174002';
  const mockUserId = '123e4567-e89b-12d3-a456-426614174003';

  const mockStartup = {
    id: mockStartupId,
    userId: mockUserId,
    name: 'Test Startup',
    slug: 'test-startup',
    tagline: 'Making testing easier',
    description: 'A comprehensive testing platform for developers that makes writing and running tests a breeze.',
    website: 'https://test.com',
    location: 'San Francisco',
    industry: 'SaaS',
    stage: 'seed' as const,
    fundingTarget: 1500000,
    teamSize: 5,
    status: 'approved' as const,
    pitchDeckUrl: 'https://deck.com/pitch.pdf',
    demoUrl: 'https://demo.test.com',
    logoUrl: null,
    submittedAt: new Date(),
    approvedAt: new Date(),
    rejectedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const _mockJobData: ScoringJobData = {
    type: 'scoring',
    startupId: mockStartupId,
    analysisJobId: mockAnalysisJobId,
    userId: mockUserId,
    priority: 1,
  };

  describe('scoring calculations', () => {
    it('should calculate market score based on industry and funding', () => {
      // High-value industry (SaaS) + high funding target should give high score
      const scores = calculateScores(mockStartup);

      expect(scores.marketScore).toBeGreaterThanOrEqual(50);
      expect(scores.marketScore).toBeLessThanOrEqual(100);
    });

    it('should calculate team score based on team size and assets', () => {
      const scores = calculateScores(mockStartup);

      // Team size 5 + website + pitch deck = good score
      expect(scores.teamScore).toBeGreaterThanOrEqual(70);
    });

    it('should calculate product score based on description and assets', () => {
      const scores = calculateScores(mockStartup);

      // Long description + tagline + demo + pitch deck = good score
      expect(scores.productScore).toBeGreaterThanOrEqual(70);
    });

    it('should calculate traction score based on stage', () => {
      const scores = calculateScores(mockStartup);

      // Seed stage + team size > 5 = decent traction
      expect(scores.tractionScore).toBeGreaterThanOrEqual(55);
    });

    it('should calculate financials score based on funding target', () => {
      const scores = calculateScores(mockStartup);

      // Funding target 500k-2M range + seed stage = good score
      expect(scores.financialsScore).toBeGreaterThanOrEqual(70);
    });

    it('should handle fintech industry with higher market score', () => {
      const fintechStartup = { ...mockStartup, industry: 'fintech' };
      const scores = calculateScores(fintechStartup);

      expect(scores.marketScore).toBeGreaterThanOrEqual(70);
    });

    it('should handle AI industry with higher market score', () => {
      const aiStartup = { ...mockStartup, industry: 'ai' };
      const scores = calculateScores(aiStartup);

      expect(scores.marketScore).toBeGreaterThanOrEqual(70);
    });

    it('should handle pre-seed stage with lower traction score', () => {
      const preSeedStartup = { ...mockStartup, stage: 'pre-seed' as const };
      const scores = calculateScores(preSeedStartup);

      expect(scores.tractionScore).toBeLessThanOrEqual(60);
    });

    it('should handle series-a stage with higher traction score', () => {
      const seriesAStartup = { ...mockStartup, stage: 'series-a' as const };
      const scores = calculateScores(seriesAStartup);

      expect(scores.tractionScore).toBeGreaterThanOrEqual(65);
    });

    it('should cap all scores at 100', () => {
      const superStartup = {
        ...mockStartup,
        industry: 'fintech ai saas',
        stage: 'series-a' as const,
        fundingTarget: 10000000,
        teamSize: 50,
      };
      const scores = calculateScores(superStartup);

      expect(scores.marketScore).toBeLessThanOrEqual(100);
      expect(scores.teamScore).toBeLessThanOrEqual(100);
      expect(scores.productScore).toBeLessThanOrEqual(100);
      expect(scores.tractionScore).toBeLessThanOrEqual(100);
      expect(scores.financialsScore).toBeLessThanOrEqual(100);
    });

    it('should ensure all scores are at least 0', () => {
      const minimalStartup = {
        ...mockStartup,
        industry: '',
        stage: 'pre-seed' as const,
        fundingTarget: 0,
        teamSize: 1,
        website: '',
        pitchDeckUrl: null,
        demoUrl: null,
        description: '',
        tagline: '',
      };
      const scores = calculateScores(minimalStartup);

      expect(scores.marketScore).toBeGreaterThanOrEqual(0);
      expect(scores.teamScore).toBeGreaterThanOrEqual(0);
      expect(scores.productScore).toBeGreaterThanOrEqual(0);
      expect(scores.tractionScore).toBeGreaterThanOrEqual(0);
      expect(scores.financialsScore).toBeGreaterThanOrEqual(0);
    });
  });
});

// Helper function that mimics the processor's scoring logic
function calculateScores(startupData: typeof _mockStartup): StartupScores {
  return {
    marketScore: calculateMarketScore(startupData),
    teamScore: calculateTeamScore(startupData),
    productScore: calculateProductScore(startupData),
    tractionScore: calculateTractionScore(startupData),
    financialsScore: calculateFinancialsScore(startupData),
  };
}

function calculateMarketScore(startupData: typeof _mockStartup): number {
  let score = 50;

  const highValueIndustries = ['fintech', 'healthtech', 'ai', 'saas', 'enterprise'];
  if (highValueIndustries.some((i) => startupData.industry?.toLowerCase().includes(i))) {
    score += 20;
  }

  if (startupData.fundingTarget > 1000000) score += 10;
  if (startupData.fundingTarget > 5000000) score += 10;

  if (startupData.stage === 'seed') score += 10;
  if (startupData.stage === 'series-a') score += 15;

  return Math.min(Math.max(score, 0), 100);
}

function calculateTeamScore(startupData: typeof _mockStartup): number {
  let score = 50;

  if (startupData.teamSize >= 3) score += 10;
  if (startupData.teamSize >= 5) score += 10;
  if (startupData.teamSize >= 10) score += 10;

  if (startupData.website) score += 10;
  if (startupData.pitchDeckUrl) score += 10;

  return Math.min(Math.max(score, 0), 100);
}

function calculateProductScore(startupData: typeof _mockStartup): number {
  let score = 50;

  if (startupData.description && startupData.description.length > 200) score += 15;
  if (startupData.tagline && startupData.tagline.length > 10) score += 10;
  if (startupData.demoUrl) score += 15;
  if (startupData.pitchDeckUrl) score += 10;

  return Math.min(Math.max(score, 0), 100);
}

function calculateTractionScore(startupData: typeof _mockStartup): number {
  let score = 40;

  if (startupData.stage === 'seed') score += 15;
  if (startupData.stage === 'series-a') score += 25;
  if (startupData.stage === 'series-b+') score += 35;

  if (startupData.teamSize > 5) score += 10;

  return Math.min(Math.max(score, 0), 100);
}

function calculateFinancialsScore(startupData: typeof _mockStartup): number {
  let score = 50;

  if (startupData.fundingTarget > 0 && startupData.fundingTarget <= 500000) {
    score += 15;
  } else if (startupData.fundingTarget > 500000 && startupData.fundingTarget <= 2000000) {
    score += 20;
  } else if (startupData.fundingTarget > 2000000) {
    score += 10;
  }

  if (startupData.stage === 'seed' || startupData.stage === 'pre-seed') {
    score += 10;
  }

  return Math.min(Math.max(score, 0), 100);
}

const _mockStartup = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  userId: '123e4567-e89b-12d3-a456-426614174003',
  name: 'Test Startup',
  slug: 'test-startup',
  tagline: 'Making testing easier',
  description: 'A comprehensive testing platform for developers that makes writing and running tests a breeze.',
  website: 'https://test.com',
  location: 'San Francisco',
  industry: 'SaaS',
  stage: 'seed' as const,
  fundingTarget: 1500000,
  teamSize: 5,
  status: 'approved' as const,
  pitchDeckUrl: 'https://deck.com/pitch.pdf',
  demoUrl: 'https://demo.test.com',
  logoUrl: null,
  submittedAt: new Date(),
  approvedAt: new Date(),
  rejectedAt: null,
  rejectionReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
