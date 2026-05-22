import { describe, expect, it, jest } from 'bun:test';
import {
  buildScreeningInputV1,
  findCanonicalStartupDuplicate,
  isReliableCompanyNameForDuplicateMatching,
  normalizeScreeningCompanyNameForDuplicateMatching,
  normalizeScreeningIntakeCandidate,
  SCREENING_INPUT_VERSION,
  ScreeningInputV1Schema,
} from '../screening-intake-normalization';
import {
  StartupSourcePath,
  StartupStage,
  StartupStatus,
} from '../entities/startup.schema';
import { UserRole } from '../../../auth/entities/auth.schema';

describe('screening intake normalization', () => {
  it('normalizes canonical intake fields for screening', () => {
    const normalized = normalizeScreeningIntakeCandidate({
      name: '  Acme, Inc.  ',
      website: 'acme.com',
      tagline: '  Build software for teams  ',
      description: '  A really good company  ',
      location: '  San Francisco  ',
      industry: '  SaaS  ',
    });

    expect(normalized).toEqual({
      name: 'Acme, Inc.',
      canonicalName: 'acme',
      website: 'https://acme.com/',
      websiteHost: 'acme.com',
      tagline: 'Build software for teams',
      description: 'A really good company',
      location: 'San Francisco',
      industry: 'SaaS',
    });
  });

  it('treats filename-like or placeholder names as unreliable for duplicate matching', () => {
    expect(isReliableCompanyNameForDuplicateMatching('deck.pdf')).toBe(false);
    expect(isReliableCompanyNameForDuplicateMatching('Untitled Startup')).toBe(false);
    expect(normalizeScreeningCompanyNameForDuplicateMatching('Acme, Inc.')).toBe('acme');
  });

  it('matches duplicates by normalized startup name first', async () => {
    const queryChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          id: 'startup-1',
          name: 'Acme, Inc.',
          status: 'submitted',
          userId: 'owner-1',
        },
      ]),
    };

    const result = await findCanonicalStartupDuplicate(queryChain as never, {
      companyName: 'ACME Inc.',
      website: 'https://other.example.com',
    });

    expect(result).toEqual({
      id: 'startup-1',
      name: 'Acme, Inc.',
      status: 'submitted',
      userId: 'owner-1',
      matchedOn: 'name',
    });
    expect(queryChain.limit).toHaveBeenCalledTimes(1);
    expect(queryChain.where).toHaveBeenCalled();
  });

  it('falls back to website host matching when the company name is not reliable', async () => {
    const queryChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          id: 'startup-2',
          name: 'Acme',
          website: 'https://acme.com',
          status: 'submitted',
          userId: 'owner-2',
        },
      ]),
    };

    const result = await findCanonicalStartupDuplicate(queryChain as never, {
      companyName: 'Untitled Startup',
      website: 'https://www.acme.com/about',
    });

    expect(result).toEqual({
      id: 'startup-2',
      name: 'Acme',
      status: 'submitted',
      userId: 'owner-2',
      matchedOn: 'website',
    });
    expect(queryChain.limit).toHaveBeenCalledTimes(1);
  });
});

// DS-E1-F4-S1: lock the canonical V1 contract. Each intake path must produce
// a value that passes ScreeningInputV1Schema.parse.
describe('canonical ScreeningInputV1', () => {
  it('emits the versioned shape for an investor-manual loose intake', () => {
    const canonical = buildScreeningInputV1({
      raw: { name: 'Acme Inc', website: 'acme.com' },
      sourcePath: StartupSourcePath.INVESTOR_MANUAL,
      submittedByRole: UserRole.INVESTOR,
      submitterUserId: 'investor-1',
    });

    expect(canonical.schemaVersion).toBe(SCREENING_INPUT_VERSION);
    expect(canonical.sourcePath).toBe(StartupSourcePath.INVESTOR_MANUAL);
    expect(canonical.company).toEqual({
      name: 'Acme Inc',
      canonicalName: 'acme',
      tagline: '',
      description: '',
      website: 'https://acme.com/',
      websiteHost: 'acme.com',
      industry: 'Unknown',
    });
    expect(canonical.stageGate.status).toBe(StartupStatus.DRAFT);
    expect(canonical.stageGate.isPrivate).toBe(false);
  });

  it('marks the deal private when the founder picks this_fund_only', () => {
    const canonical = buildScreeningInputV1({
      raw: {
        name: 'Beta Co',
        website: 'https://beta.example',
        tagline: 'Tagline',
        description: 'Description here',
        location: 'Dubai, UAE',
        industry: 'AI',
      },
      sourcePath: StartupSourcePath.FOUNDER_SUBMITTED,
      status: StartupStatus.ANALYZING,
      isPrivate: true,
      stage: StartupStage.SEED,
      fundingTarget: 1_000_000,
      teamSize: 3,
      portalId: 'portal-1',
      founderEmail: 'founder@example.com',
      founderName: 'Founder',
    });

    expect(canonical.stageGate.isPrivate).toBe(true);
    expect(canonical.owners.portalId).toBe('portal-1');
    expect(canonical.round).toEqual({
      stage: StartupStage.SEED,
      fundingTarget: 1_000_000,
      teamSize: 3,
    });
    expect(canonical.geography.raw).toBe('Dubai, UAE');
  });

  it('rejects a candidate missing required canonical fields', () => {
    // Forcing an invalid shape past the builder helper to prove the schema
    // is the load-bearing assertion, not the builder defaults.
    const invalid = {
      schemaVersion: 1,
      sourcePath: StartupSourcePath.CLARA,
      company: { name: '', canonicalName: null, tagline: '', description: '', website: '', websiteHost: null, industry: '' },
      round: {},
      geography: { raw: 'Unknown', normalizedRegion: null, countryCode: null, level1: null, level2: null, level3: null, path: [] },
      owners: { portalId: null, founderEmail: null, founderName: null },
      stageGate: { status: StartupStatus.DRAFT, isPrivate: false },
    };

    expect(() => ScreeningInputV1Schema.parse(invalid)).toThrow();
  });
});
