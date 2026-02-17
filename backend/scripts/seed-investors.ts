import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as schema from '../src/database/schema';
import { StartupStage } from '../src/modules/startup/entities/startup.schema';
import type {
  ScoringRationale,
  ScoringWeights,
} from '../src/modules/investor/entities/investor.schema';

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Investor123';

const baseWeights: ScoringWeights = {
  team: 25,
  market: 18,
  product: 12,
  traction: 10,
  businessModel: 10,
  gtm: 7,
  financials: 3,
  competitiveAdvantage: 7,
  legal: 3,
  dealTerms: 3,
  exitPotential: 2,
};

const baseRationale: ScoringRationale = {
  team: 'Execution quality and founder-market fit are still leading indicators.',
  market: 'Large, expanding markets with clear demand signals rank higher.',
  product: 'Product quality and differentiation reduce long-term execution risk.',
  traction: 'Early traction validates demand and GTM assumptions.',
  businessModel: 'Monetization clarity and margins impact venture outcomes.',
  gtm: 'Distribution strategy quality determines growth efficiency.',
  financials: 'Financial discipline and runway planning support execution.',
  competitiveAdvantage: 'Defensibility matters for long-term category leadership.',
  legal: 'Clean legal and compliance posture reduces downside risk.',
  dealTerms: 'Deal structure must align incentives and upside.',
  exitPotential: 'Credible paths to liquidity increase portfolio value.',
};

type SeedInvestor = {
  name: string;
  email: string;
  fundName: string;
  fundDescription: string;
  website: string;
  aum: string;
  teamSize: number;
  thesis: Omit<schema.NewInvestorThesis, 'userId'>;
  scoringByStage: Array<{
    stage: StartupStage;
    useCustomWeights: boolean;
    customWeights: ScoringWeights | null;
    customRationale: ScoringRationale | null;
  }>;
};

const investors: SeedInvestor[] = [
  {
    name: 'Sarah Chen',
    email: 'investor+sarah@insideline.dev',
    fundName: 'Northstar Ventures',
    fundDescription:
      'Seed-first fund backing technical founders in B2B software and AI.',
    website: 'https://northstar-ventures.example',
    aum: '$120M',
    teamSize: 8,
    thesis: {
      industries: ['AI', 'B2B SaaS', 'Developer Tools'],
      stages: ['pre_seed', 'seed', 'series_a'],
      checkSizeMin: 250000,
      checkSizeMax: 2500000,
      geographicFocus: ['North America'],
      geographicFocusNodes: ['north-america'],
      mustHaveFeatures: ['Technical founder', 'Clear wedge into enterprise'],
      dealBreakers: ['No technical moat', 'Unclear ICP'],
      notes: 'Prefers founder-led sales motion with strong user pull.',
      businessModels: ['B2B SaaS', 'Usage-based'],
      minRevenue: 0,
      minGrowthRate: 0.15,
      minTeamSize: 2,
      thesisNarrative:
        'We back infrastructure and workflow products that become default systems of record for modern teams.',
      antiPortfolio: 'Avoid heavily services-dependent businesses.',
      website: 'https://northstar-ventures.example',
      fundSize: 120000000,
      minThesisFitScore: 70,
      minStartupScore: 65,
      thesisSummary:
        'Northstar focuses on early-stage AI and SaaS with strong technical moats and enterprise demand.',
      portfolioCompanies: [
        { name: 'BuildGrid', stage: 'Series A' },
        { name: 'OpsMint', stage: 'Seed' },
      ],
      thesisSummaryGeneratedAt: new Date(),
      isActive: true,
    },
    scoringByStage: [
      {
        stage: StartupStage.SEED,
        useCustomWeights: true,
        customWeights: {
          ...baseWeights,
          team: 28,
          product: 10,
          financials: 2,
        },
        customRationale: {
          ...baseRationale,
          team: 'At seed, founder quality is the strongest predictor of outcome.',
        },
      },
      {
        stage: StartupStage.SERIES_A,
        useCustomWeights: false,
        customWeights: null,
        customRationale: null,
      },
    ],
  },
  {
    name: 'Omar El-Haddad',
    email: 'investor+omar@insideline.dev',
    fundName: 'Atlas Capital',
    fundDescription:
      'Early growth fund investing in fintech, vertical SaaS, and data platforms.',
    website: 'https://atlas-capital.example',
    aum: '$300M',
    teamSize: 14,
    thesis: {
      industries: ['Fintech', 'Vertical SaaS', 'Data Infrastructure'],
      stages: ['seed', 'series_a', 'series_b'],
      checkSizeMin: 1000000,
      checkSizeMax: 7000000,
      geographicFocus: ['United States', 'Europe'],
      geographicFocusNodes: ['united-states', 'europe'],
      mustHaveFeatures: ['Strong distribution model', 'Regulatory awareness'],
      dealBreakers: ['Weak retention', 'Commoditized product'],
      notes: 'Looks for 3x YoY growth potential in 24 months.',
      businessModels: ['B2B SaaS', 'Transaction-based'],
      minRevenue: 500000,
      minGrowthRate: 0.3,
      minTeamSize: 6,
      thesisNarrative:
        'We invest in category leaders modernizing mission-critical financial and operational workflows.',
      antiPortfolio: 'Avoids pure consumer social applications.',
      website: 'https://atlas-capital.example',
      fundSize: 300000000,
      minThesisFitScore: 72,
      minStartupScore: 68,
      thesisSummary:
        'Atlas prefers high-growth B2B fintech and vertical SaaS with strong retention and scalable GTM.',
      portfolioCompanies: [
        { name: 'LedgerFlow', stage: 'Series B' },
        { name: 'ClinicCore', stage: 'Series A' },
      ],
      thesisSummaryGeneratedAt: new Date(),
      isActive: true,
    },
    scoringByStage: [
      {
        stage: StartupStage.SERIES_A,
        useCustomWeights: true,
        customWeights: {
          ...baseWeights,
          market: 14,
          traction: 14,
          businessModel: 12,
          legal: 2,
          exitPotential: 1,
        },
        customRationale: {
          ...baseRationale,
          traction: 'Series A requires stronger proof of repeatable growth.',
        },
      },
    ],
  },
  {
    name: 'Lina Haddad',
    email: 'investor+lina@insideline.dev',
    fundName: 'Mosaic Angels',
    fundDescription:
      'Angel syndicate focused on diverse founding teams and impact-driven software.',
    website: 'https://mosaic-angels.example',
    aum: '$45M',
    teamSize: 4,
    thesis: {
      industries: ['HealthTech', 'ClimateTech', 'Future of Work'],
      stages: ['pre_seed', 'seed'],
      checkSizeMin: 50000,
      checkSizeMax: 500000,
      geographicFocus: ['MENA', 'Europe'],
      geographicFocusNodes: ['mena', 'europe'],
      mustHaveFeatures: ['Clear impact metric', 'Founder insight'],
      dealBreakers: ['No measurable user value'],
      notes: 'Open to first-check opportunities with exceptional teams.',
      businessModels: ['B2B SaaS', 'Marketplace'],
      minRevenue: 0,
      minGrowthRate: 0.1,
      minTeamSize: 2,
      thesisNarrative:
        'Mosaic supports mission-driven founders building durable products with global potential.',
      antiPortfolio: 'Avoids ad-driven consumer products.',
      website: 'https://mosaic-angels.example',
      fundSize: 45000000,
      minThesisFitScore: 65,
      minStartupScore: 60,
      thesisSummary:
        'Mosaic invests early in impact-oriented founders across MENA and Europe.',
      portfolioCompanies: [
        { name: 'CarbonPulse', stage: 'Seed' },
        { name: 'CareBridge', stage: 'Pre-seed' },
      ],
      thesisSummaryGeneratedAt: new Date(),
      isActive: true,
    },
    scoringByStage: [
      {
        stage: StartupStage.PRE_SEED,
        useCustomWeights: true,
        customWeights: {
          ...baseWeights,
          team: 30,
          market: 16,
          product: 13,
          traction: 8,
          legal: 2,
          exitPotential: 1,
        },
        customRationale: {
          ...baseRationale,
          team: 'At pre-seed, team quality outweighs short-term traction.',
        },
      },
    ],
  },
];

function ensureWeightsSumTo100(weights: ScoringWeights): void {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total !== 100) {
    throw new Error(`Custom weights must sum to 100. Received: ${total}`);
  }
}

async function seedStageDefaults(db: ReturnType<typeof drizzle<typeof schema>>) {
  const stages = Object.values(StartupStage);

  for (const stage of stages) {
    await db
      .insert(schema.stageScoringWeight)
      .values({
        stage,
        weights: baseWeights,
        rationale: baseRationale,
        overallRationale:
          'Default platform scoring balances team quality, market size, and execution evidence by stage.',
      })
      .onConflictDoUpdate({
        target: schema.stageScoringWeight.stage,
        set: {
          weights: baseWeights,
          rationale: baseRationale,
          overallRationale:
            'Default platform scoring balances team quality, market size, and execution evidence by stage.',
          updatedAt: new Date(),
        },
      });
  }
}

async function upsertInvestor(db: ReturnType<typeof drizzle<typeof schema>>, entry: SeedInvestor) {
  const [seededUser] = await db
    .insert(schema.user)
    .values({
      email: entry.email.toLowerCase().trim(),
      name: entry.name,
      role: schema.UserRole.INVESTOR,
      emailVerified: true,
      onboardingCompleted: true,
    })
    .onConflictDoUpdate({
      target: schema.user.email,
      set: {
        name: entry.name,
        role: schema.UserRole.INVESTOR,
        emailVerified: true,
        onboardingCompleted: true,
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.user.id, email: schema.user.email });

  if (!seededUser) {
    throw new Error(`Failed to seed user ${entry.email}`);
  }

  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  await db
    .insert(schema.account)
    .values({
      userId: seededUser.id,
      providerId: 'credential',
      accountId: seededUser.id,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.account.providerId, schema.account.accountId],
      set: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(schema.investorProfile)
    .values({
      userId: seededUser.id,
      fundName: entry.fundName,
      fundDescription: entry.fundDescription,
      aum: entry.aum,
      teamSize: entry.teamSize,
      website: entry.website,
    })
    .onConflictDoUpdate({
      target: schema.investorProfile.userId,
      set: {
        fundName: entry.fundName,
        fundDescription: entry.fundDescription,
        aum: entry.aum,
        teamSize: entry.teamSize,
        website: entry.website,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(schema.investorThesis)
    .values({
      userId: seededUser.id,
      ...entry.thesis,
    })
    .onConflictDoUpdate({
      target: schema.investorThesis.userId,
      set: {
        ...entry.thesis,
        updatedAt: new Date(),
      },
    });

  await db
    .delete(schema.investorScoringPreference)
    .where(eq(schema.investorScoringPreference.investorId, seededUser.id));

  for (const pref of entry.scoringByStage) {
    if (pref.customWeights) {
      ensureWeightsSumTo100(pref.customWeights);
    }

    await db.insert(schema.investorScoringPreference).values({
      investorId: seededUser.id,
      stage: pref.stage,
      useCustomWeights: pref.useCustomWeights,
      customWeights: pref.customWeights,
      customRationale: pref.customRationale,
    });
  }

  return seededUser;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client, { schema });

  try {
    await seedStageDefaults(db);

    const seededUsers: Array<{ id: string; email: string }> = [];
    for (const investor of investors) {
      const seededUser = await upsertInvestor(db, investor);
      seededUsers.push(seededUser);
    }

    console.log('✅ Investor seed completed');
    console.log(`Password for all seeded investors: ${DEFAULT_PASSWORD}`);
    console.log('Seeded investors:');
    for (const seededUser of seededUsers) {
      console.log(`- ${seededUser.email} (${seededUser.id})`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('❌ Failed to seed investors:', error);
  process.exit(1);
});
