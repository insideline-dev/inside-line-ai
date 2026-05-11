import { describe, expect, it, jest } from 'bun:test';
import {
  findCanonicalStartupDuplicate,
  isReliableCompanyNameForDuplicateMatching,
  normalizeScreeningCompanyNameForDuplicateMatching,
  normalizeScreeningIntakeCandidate,
} from '../screening-intake-normalization';

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
