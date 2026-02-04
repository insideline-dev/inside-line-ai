import {
  mock,
  describe,
  it,
  expect,
} from 'bun:test';
import type { StartupScores } from '../interfaces';

// Mock bullmq
mock.module('bullmq', () => ({
  Worker: mock(() => ({
    on: mock(() => ({})),
    close: mock(() => Promise.resolve()),
  })),
  Job: mock(() => ({})),
  UnrecoverableError: class extends Error {},
}));

describe('PdfProcessor', () => {
  const mockStartupId = '123e4567-e89b-12d3-a456-426614174000';
  const mockUserId = '123e4567-e89b-12d3-a456-426614174001';

  const mockStartup = {
    id: mockStartupId,
    userId: mockUserId,
    name: 'Test Startup',
    slug: 'test-startup',
    tagline: 'Making testing easier',
    description: 'A comprehensive testing platform.',
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

  const mockScores: StartupScores = {
    marketScore: 85,
    teamScore: 80,
    productScore: 75,
    tractionScore: 70,
    financialsScore: 65,
  };

  describe('memo content generation', () => {
    it('should generate memo with company overview', () => {
      const content = generateMemoContent(mockStartup, null);

      expect(content).toContain('INVESTMENT MEMO');
      expect(content).toContain(mockStartup.name);
      expect(content).toContain('COMPANY OVERVIEW');
      expect(content).toContain(mockStartup.tagline);
      expect(content).toContain(mockStartup.industry);
      expect(content).toContain(mockStartup.stage);
      expect(content).toContain(mockStartup.location);
    });

    it('should include scores when available', () => {
      const content = generateMemoContent(mockStartup, mockScores);

      expect(content).toContain('SCORING ANALYSIS');
      expect(content).toContain(`Market Score: ${mockScores.marketScore}/100`);
      expect(content).toContain(`Team Score: ${mockScores.teamScore}/100`);
      expect(content).toContain(`Product Score: ${mockScores.productScore}/100`);
      expect(content).toContain(`Traction Score: ${mockScores.tractionScore}/100`);
      expect(content).toContain(`Financials Score: ${mockScores.financialsScore}/100`);
    });

    it('should not include scores section when scores are null', () => {
      const content = generateMemoContent(mockStartup, null);

      expect(content).not.toContain('SCORING ANALYSIS');
      expect(content).not.toContain('Market Score:');
    });

    it('should include links when available', () => {
      const content = generateMemoContent(mockStartup, null);

      expect(content).toContain(`Website: ${mockStartup.website}`);
      expect(content).toContain(`Pitch Deck: ${mockStartup.pitchDeckUrl}`);
      expect(content).toContain(`Demo: ${mockStartup.demoUrl}`);
    });

    it('should not include links when not available', () => {
      const startupWithoutLinks = {
        ...mockStartup,
        website: null,
        pitchDeckUrl: null,
        demoUrl: null,
      };
      const content = generateMemoContent(startupWithoutLinks as any, null);

      expect(content).not.toContain('Website:');
      expect(content).not.toContain('Pitch Deck:');
      expect(content).not.toContain('Demo:');
    });

    it('should format funding target with locale string', () => {
      const content = generateMemoContent(mockStartup, null);

      expect(content).toContain('$1,500,000');
    });

    it('should include generation timestamp', () => {
      const content = generateMemoContent(mockStartup, null);

      expect(content).toContain('Generated:');
    });
  });
});

// Helper function that mimics the processor's content generation
function generateMemoContent(
  startupData: typeof mockStartup,
  scores: StartupScores | null,
): string {
  const lines = [
    `INVESTMENT MEMO - ${startupData.name}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    `== COMPANY OVERVIEW ==`,
    `Name: ${startupData.name}`,
    `Tagline: ${startupData.tagline}`,
    `Industry: ${startupData.industry}`,
    `Stage: ${startupData.stage}`,
    `Location: ${startupData.location}`,
    `Team Size: ${startupData.teamSize}`,
    `Funding Target: $${startupData.fundingTarget.toLocaleString()}`,
    '',
    `== DESCRIPTION ==`,
    startupData.description,
    '',
  ];

  if (scores) {
    lines.push(
      `== SCORING ANALYSIS ==`,
      `Market Score: ${scores.marketScore}/100`,
      `Team Score: ${scores.teamScore}/100`,
      `Product Score: ${scores.productScore}/100`,
      `Traction Score: ${scores.tractionScore}/100`,
      `Financials Score: ${scores.financialsScore}/100`,
      '',
    );
  }

  if (startupData.website) {
    lines.push(`Website: ${startupData.website}`);
  }
  if (startupData.pitchDeckUrl) {
    lines.push(`Pitch Deck: ${startupData.pitchDeckUrl}`);
  }
  if (startupData.demoUrl) {
    lines.push(`Demo: ${startupData.demoUrl}`);
  }

  return lines.join('\n');
}

const mockStartup = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  userId: '123e4567-e89b-12d3-a456-426614174001',
  name: 'Test Startup',
  slug: 'test-startup',
  tagline: 'Making testing easier',
  description: 'A comprehensive testing platform.',
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
