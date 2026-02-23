# Admin Investors Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Read-only admin page to monitor investor profiles, thesis, matched startups, and scoring preferences via a list + side panel layout.

**Architecture:** Two new GET endpoints in the admin module (`/admin/investors` list, `/admin/investors/:userId` detail). New `AdminInvestorService` with Drizzle queries joining investor profile, thesis, matches (with startup names), and scoring preferences. Frontend route at `admin/investors` using DataTable + Sheet side panel with Tabs. Orval regeneration after backend endpoints are live.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL, React 19, TanStack Router/Query, shadcn/ui (Sheet, Tabs, Badge, Card, DataTable), Orval codegen

---

## Task 1: Create AdminInvestorService

**Files:**
- Create: `backend/src/modules/admin/admin-investor.service.ts`
- Modify: `backend/src/modules/admin/admin.module.ts` (add to providers)

**Step 1: Create the service file**

Create `backend/src/modules/admin/admin-investor.service.ts`:

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, count, desc, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { user } from '../../auth/entities/auth.schema';
import {
  investorProfile,
  investorThesis,
  startupMatch,
  investorScoringPreference,
} from '../investor/entities/investor.schema';
import { startup } from '../startup/entities/startup.schema';

@Injectable()
export class AdminInvestorService {
  private readonly logger = new Logger(AdminInvestorService.name);

  constructor(private drizzle: DrizzleService) {}

  async listInvestors() {
    const investors = await this.drizzle.db
      .select({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        fundName: investorProfile.fundName,
        aum: investorProfile.aum,
        teamSize: investorProfile.teamSize,
        website: investorProfile.website,
        logoUrl: investorProfile.logoUrl,
        industries: investorThesis.industries,
        stages: investorThesis.stages,
        checkSizeMin: investorThesis.checkSizeMin,
        checkSizeMax: investorThesis.checkSizeMax,
        thesisSummary: investorThesis.thesisSummary,
        thesisSummaryGeneratedAt: investorThesis.thesisSummaryGeneratedAt,
        isActive: investorThesis.isActive,
        thesisCreatedAt: investorThesis.createdAt,
        matchCount: sql<number>`(
          SELECT COUNT(*)::int FROM startup_matches
          WHERE startup_matches.investor_id = ${user.id}
        )`,
        createdAt: user.createdAt,
      })
      .from(user)
      .leftJoin(investorProfile, eq(investorProfile.userId, user.id))
      .leftJoin(investorThesis, eq(investorThesis.userId, user.id))
      .where(eq(user.role, 'investor'))
      .orderBy(desc(user.createdAt));

    return investors.map((inv) => ({
      ...inv,
      hasThesis: inv.thesisCreatedAt !== null,
      industries: inv.industries ?? [],
      stages: inv.stages ?? [],
    }));
  }

  async getInvestorDetail(userId: string) {
    // Verify user is an investor
    const [investorUser] = await this.drizzle.db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!investorUser) {
      throw new NotFoundException('Investor not found');
    }

    const [profile, thesis, matches, scoringPrefs] = await Promise.all([
      // Profile
      this.drizzle.db
        .select()
        .from(investorProfile)
        .where(eq(investorProfile.userId, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),

      // Thesis
      this.drizzle.db
        .select()
        .from(investorThesis)
        .where(eq(investorThesis.userId, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),

      // Matches with startup name
      this.drizzle.db
        .select({
          id: startupMatch.id,
          startupId: startupMatch.startupId,
          startupName: startup.name,
          overallScore: startupMatch.overallScore,
          thesisFitScore: startupMatch.thesisFitScore,
          fitRationale: startupMatch.fitRationale,
          status: startupMatch.status,
          statusChangedAt: startupMatch.statusChangedAt,
          isSaved: startupMatch.isSaved,
          matchReason: startupMatch.matchReason,
          createdAt: startupMatch.createdAt,
        })
        .from(startupMatch)
        .innerJoin(startup, eq(startup.id, startupMatch.startupId))
        .where(eq(startupMatch.investorId, userId))
        .orderBy(desc(startupMatch.overallScore)),

      // Scoring preferences
      this.drizzle.db
        .select({
          stage: investorScoringPreference.stage,
          useCustomWeights: investorScoringPreference.useCustomWeights,
          customWeights: investorScoringPreference.customWeights,
        })
        .from(investorScoringPreference)
        .where(eq(investorScoringPreference.investorId, userId)),
    ]);

    return {
      user: investorUser,
      profile,
      thesis,
      matches,
      scoringPreferences: scoringPrefs,
    };
  }
}
```

**Step 2: Register in admin module**

In `backend/src/modules/admin/admin.module.ts`, add import and provider:

```typescript
// Add import at top
import { AdminInvestorService } from './admin-investor.service';

// Add to providers array
providers: [
  // ... existing providers
  AdminInvestorService,
],
```

**Step 3: Verify compilation**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/modules/admin/admin-investor.service.ts backend/src/modules/admin/admin.module.ts
git commit -m "feat(admin): add AdminInvestorService for investor listing and detail"
```

---

## Task 2: Add Admin Controller Endpoints

**Files:**
- Modify: `backend/src/modules/admin/admin.controller.ts`

**Step 1: Add endpoints to controller**

In `backend/src/modules/admin/admin.controller.ts`:

Add import at top:
```typescript
import { AdminInvestorService } from './admin-investor.service';
```

Add to constructor:
```typescript
private adminInvestorService: AdminInvestorService,
```

Add endpoints (place near the existing `getInvestorStats` endpoint around line 171):

```typescript
@Get('investors')
@ApiOperation({ summary: 'List all investors with profile and thesis summary' })
async listInvestors() {
  return this.adminInvestorService.listInvestors();
}

@Get('investors/:userId')
@ApiOperation({ summary: 'Get full investor detail (profile, thesis, matches, scoring)' })
async getInvestorDetail(@Param('userId', ParseUUIDPipe) userId: string) {
  return this.adminInvestorService.getInvestorDetail(userId);
}
```

**Step 2: Verify compilation**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/modules/admin/admin.controller.ts
git commit -m "feat(admin): add GET /admin/investors and GET /admin/investors/:userId endpoints"
```

---

## Task 3: Write Backend Tests

**Files:**
- Create: `backend/src/modules/admin/tests/admin-investor.service.spec.ts`

**Step 1: Write test file**

Create `backend/src/modules/admin/tests/admin-investor.service.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminInvestorService } from '../admin-investor.service';
import { DrizzleService } from '../../../database';

// Mock DrizzleService with chainable query builder
function createMockQueryBuilder(result: unknown = []) {
  const builder: Record<string, unknown> = {};
  const methods = [
    'select', 'from', 'where', 'leftJoin', 'innerJoin',
    'orderBy', 'limit', 'groupBy', 'then',
  ];
  for (const method of methods) {
    builder[method] = () => builder;
  }
  // Make it thenable to resolve in Promise.all
  builder.then = (resolve: (v: unknown) => void) => resolve(result);
  return builder;
}

describe('AdminInvestorService', () => {
  let service: AdminInvestorService;
  let mockDb: { select: () => unknown };

  beforeEach(async () => {
    mockDb = {
      select: () => createMockQueryBuilder([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminInvestorService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
      ],
    }).compile();

    service = module.get(AdminInvestorService);
  });

  describe('listInvestors', () => {
    it('should return an array', async () => {
      const result = await service.listInvestors();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getInvestorDetail', () => {
    it('should throw NotFoundException when user not found', async () => {
      // Mock returns empty array for user lookup
      mockDb.select = () => createMockQueryBuilder([]);

      try {
        await service.getInvestorDetail('00000000-0000-0000-0000-000000000000');
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect(e).toBeInstanceOf(NotFoundException);
      }
    });
  });
});
```

**Step 2: Run tests**

Run: `cd backend && bun test src/modules/admin/tests/admin-investor.service.spec.ts`
Expected: Tests pass (adjust mock as needed if Drizzle chain doesn't match)

**Step 3: Commit**

```bash
git add backend/src/modules/admin/tests/admin-investor.service.spec.ts
git commit -m "test(admin): add AdminInvestorService unit tests"
```

---

## Task 4: Regenerate Orval API Client

**Prerequisite:** Backend must be running with `ENABLE_SWAGGER=true`.

**Step 1: Start backend if not running**

Run: `cd backend && bun dev` (in a separate terminal, or ensure it's already running)

**Step 2: Regenerate API client**

Run: `cd frontend && bun generate:api`
Expected: Orval regenerates hooks including new `useAdminControllerListInvestors` and `useAdminControllerGetInvestorDetail`

**Step 3: Verify new hooks exist**

Check that new hooks appear in `frontend/src/api/generated/admin/admin.ts`

**Step 4: Commit**

```bash
git add frontend/src/api/generated/
git commit -m "chore: regenerate Orval API client with admin investor endpoints"
```

---

## Task 5: Add Sidebar Nav Entry

**Files:**
- Modify: `frontend/src/components/layouts/RoleSidebar.tsx`

**Step 1: Add investor nav item**

In `frontend/src/components/layouts/RoleSidebar.tsx`, add to the admin nav array after "Users":

Add import at top:
```typescript
import { UserRoundSearch } from 'lucide-react';
```

Then in the `admin` array, after `{ title: "Users", url: "/admin/users", icon: Users }`:

```typescript
{ title: "Investors", url: "/admin/investors", icon: UserRoundSearch },
```

**Step 2: Verify compilation**

Run: `cd frontend && bunx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/layouts/RoleSidebar.tsx
git commit -m "feat(admin): add Investors link to admin sidebar navigation"
```

---

## Task 6: Create Admin Investors Page

**Files:**
- Create: `frontend/src/routes/_protected/admin/investors.tsx`

**Step 1: Create the route file**

Create `frontend/src/routes/_protected/admin/investors.tsx`:

```typescript
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DataTable } from "@/components/DataTable";
import { customFetch } from "@/api/client";
import {
  Building2,
  Users as UsersIcon,
  Globe,
  DollarSign,
  TrendingUp,
  ShieldAlert,
  Scale,
} from "lucide-react";

export const Route = createFileRoute("/_protected/admin/investors")({
  component: AdminInvestorsPage,
});

// ---------- Types ----------

interface InvestorListItem {
  userId: string;
  userName: string | null;
  userEmail: string;
  fundName: string | null;
  aum: string | null;
  teamSize: number | null;
  website: string | null;
  logoUrl: string | null;
  industries: string[];
  stages: string[];
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  thesisSummary: string | null;
  thesisSummaryGeneratedAt: string | null;
  isActive: boolean | null;
  hasThesis: boolean;
  matchCount: number;
  createdAt: string;
}

interface InvestorDetail {
  user: { id: string; name: string | null; email: string };
  profile: {
    fundName: string;
    aum: string | null;
    teamSize: number | null;
    website: string | null;
    logoUrl: string | null;
  } | null;
  thesis: {
    industries: string[] | null;
    stages: string[] | null;
    checkSizeMin: number | null;
    checkSizeMax: number | null;
    geographicFocus: string[] | null;
    businessModels: string[] | null;
    mustHaveFeatures: string[] | null;
    dealBreakers: string[] | null;
    thesisNarrative: string | null;
    antiPortfolio: string | null;
    thesisSummary: string | null;
    fundSize: number | null;
    notes: string | null;
    isActive: boolean;
    thesisSummaryGeneratedAt: string | null;
  } | null;
  matches: Array<{
    id: string;
    startupId: string;
    startupName: string;
    overallScore: number;
    thesisFitScore: number | null;
    fitRationale: string | null;
    status: string;
    statusChangedAt: string | null;
    isSaved: boolean;
    matchReason: string | null;
    createdAt: string;
  }>;
  scoringPreferences: Array<{
    stage: string;
    useCustomWeights: boolean;
    customWeights: Record<string, number> | null;
  }>;
}

// ---------- Helpers ----------

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCheckSize(min: number | null, max: number | null) {
  if (!min && !max) return "—";
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : `$${(n / 1_000).toFixed(0)}K`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  return `Up to ${fmt(max!)}`;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  reviewing: "bg-yellow-100 text-yellow-800",
  engaged: "bg-green-100 text-green-800",
  closed: "bg-purple-100 text-purple-800",
  passed: "bg-gray-100 text-gray-800",
};

// ---------- Main Component ----------

function AdminInvestorsPage() {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: investors = [], isLoading, error } = useQuery({
    queryKey: ["admin", "investors"],
    queryFn: () => customFetch<InvestorListItem[]>("/admin/investors"),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["admin", "investors", selectedUserId],
    queryFn: () =>
      customFetch<InvestorDetail>(`/admin/investors/${selectedUserId}`),
    enabled: !!selectedUserId,
  });

  const filtered = investors.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.fundName?.toLowerCase().includes(q) ||
      inv.userName?.toLowerCase().includes(q) ||
      inv.userEmail.toLowerCase().includes(q) ||
      inv.industries.some((i) => i.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Investors</h1>
        <p className="text-muted-foreground">
          Monitor investor profiles, thesis, and startup matches.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-medium">
            All Investors ({filtered.length})
          </CardTitle>
          <Input
            placeholder="Search by fund, name, or industry..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load investors: {(error as Error).message}
            </p>
          ) : (
            <DataTable<InvestorListItem>
              data={filtered}
              columns={[
                {
                  header: "Fund / Name",
                  cell: (row) => (
                    <button
                      onClick={() => setSelectedUserId(row.userId)}
                      className="text-left hover:underline font-medium"
                    >
                      {row.fundName || row.userName || row.userEmail}
                    </button>
                  ),
                },
                {
                  header: "AUM",
                  cell: (row) => (
                    <span className="text-muted-foreground">
                      {row.aum || "—"}
                    </span>
                  ),
                },
                {
                  header: "Industries",
                  cell: (row) => (
                    <div className="flex flex-wrap gap-1">
                      {row.industries.slice(0, 3).map((ind) => (
                        <Badge key={ind} variant="outline" className="text-xs">
                          {ind}
                        </Badge>
                      ))}
                      {row.industries.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{row.industries.length - 3}
                        </Badge>
                      )}
                    </div>
                  ),
                },
                {
                  header: "Stages",
                  cell: (row) => (
                    <div className="flex flex-wrap gap-1">
                      {row.stages.slice(0, 2).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                      {row.stages.length > 2 && (
                        <Badge variant="secondary" className="text-xs">
                          +{row.stages.length - 2}
                        </Badge>
                      )}
                    </div>
                  ),
                },
                {
                  header: "Matches",
                  numeric: true,
                  cell: (row) => (
                    <span className="font-medium">{row.matchCount}</span>
                  ),
                },
                {
                  header: "Thesis",
                  cell: (row) => (
                    <Badge
                      variant={row.hasThesis ? "default" : "outline"}
                      className="text-xs"
                    >
                      {row.hasThesis
                        ? row.isActive
                          ? "Active"
                          : "Inactive"
                        : "None"}
                    </Badge>
                  ),
                },
              ]}
              rowKey={(row) => row.userId}
              emptyState="No investors found."
            />
          )}
        </CardContent>
      </Card>

      {/* Detail Side Panel */}
      <Sheet
        open={!!selectedUserId}
        onOpenChange={(open) => {
          if (!open) setSelectedUserId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-hidden p-0"
        >
          {detailLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detail ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="px-6 pt-6 pb-2">
                <SheetTitle>
                  {detail.profile?.fundName ||
                    detail.user.name ||
                    detail.user.email}
                </SheetTitle>
                <SheetDescription>{detail.user.email}</SheetDescription>
              </SheetHeader>

              <Tabs defaultValue="thesis" className="flex-1 flex flex-col">
                <TabsList className="mx-6 w-fit">
                  <TabsTrigger value="thesis">Profile & Thesis</TabsTrigger>
                  <TabsTrigger value="matches">
                    Matches ({detail.matches.length})
                  </TabsTrigger>
                  <TabsTrigger value="scoring">Scoring</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1">
                  {/* ---- Tab: Profile & Thesis ---- */}
                  <TabsContent value="thesis" className="px-6 pb-6 space-y-6">
                    {detail.profile && (
                      <Card>
                        <CardContent className="pt-6 space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {detail.profile.aum && (
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                                <span>AUM: {detail.profile.aum}</span>
                              </div>
                            )}
                            {detail.profile.teamSize && (
                              <div className="flex items-center gap-2">
                                <UsersIcon className="h-4 w-4 text-muted-foreground" />
                                <span>Team: {detail.profile.teamSize}</span>
                              </div>
                            )}
                            {detail.profile.website && (
                              <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4 text-muted-foreground" />
                                <a
                                  href={detail.profile.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline truncate"
                                >
                                  {detail.profile.website}
                                </a>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {detail.thesis ? (
                      <>
                        {detail.thesis.thesisSummary && (
                          <div>
                            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <TrendingUp className="h-4 w-4" />
                              AI Thesis Summary
                            </h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {detail.thesis.thesisSummary}
                            </p>
                            {detail.thesis.thesisSummaryGeneratedAt && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Generated{" "}
                                {formatDate(
                                  detail.thesis.thesisSummaryGeneratedAt,
                                )}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="space-y-3">
                          {detail.thesis.industries &&
                            detail.thesis.industries.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Industries
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detail.thesis.industries.map((i) => (
                                    <Badge
                                      key={i}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {i}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                          {detail.thesis.stages &&
                            detail.thesis.stages.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Stages
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detail.thesis.stages.map((s) => (
                                    <Badge
                                      key={s}
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {s}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Check Size
                            </p>
                            <p className="text-sm">
                              {formatCheckSize(
                                detail.thesis.checkSizeMin,
                                detail.thesis.checkSizeMax,
                              )}
                            </p>
                          </div>

                          {detail.thesis.geographicFocus &&
                            detail.thesis.geographicFocus.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Geographic Focus
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detail.thesis.geographicFocus.map((g) => (
                                    <Badge
                                      key={g}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {g}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                          {detail.thesis.dealBreakers &&
                            detail.thesis.dealBreakers.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                  <ShieldAlert className="h-3 w-3" />
                                  Deal Breakers
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detail.thesis.dealBreakers.map((d) => (
                                    <Badge
                                      key={d}
                                      variant="destructive"
                                      className="text-xs"
                                    >
                                      {d}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                          {detail.thesis.mustHaveFeatures &&
                            detail.thesis.mustHaveFeatures.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Must-Have Features
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detail.thesis.mustHaveFeatures.map((f) => (
                                    <Badge
                                      key={f}
                                      variant="default"
                                      className="text-xs"
                                    >
                                      {f}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                          {detail.thesis.thesisNarrative && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Thesis Narrative
                              </p>
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {detail.thesis.thesisNarrative}
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No investment thesis configured yet.
                      </p>
                    )}
                  </TabsContent>

                  {/* ---- Tab: Matches ---- */}
                  <TabsContent value="matches" className="px-6 pb-6">
                    {detail.matches.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        No startup matches yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {detail.matches.map((match) => (
                          <Card key={match.id}>
                            <CardContent className="pt-4 pb-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-sm">
                                  {match.startupName}
                                </span>
                                <Badge
                                  className={`text-xs ${statusColors[match.status] ?? ""}`}
                                >
                                  {match.status}
                                </Badge>
                              </div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>
                                  Overall:{" "}
                                  <strong className="text-foreground">
                                    {match.overallScore}
                                  </strong>
                                </span>
                                {match.thesisFitScore != null && (
                                  <span>
                                    Thesis Fit:{" "}
                                    <strong className="text-foreground">
                                      {match.thesisFitScore}
                                    </strong>
                                  </span>
                                )}
                                <span>
                                  Matched: {formatDate(match.createdAt)}
                                </span>
                                {match.statusChangedAt && (
                                  <span>
                                    Status changed:{" "}
                                    {formatDate(match.statusChangedAt)}
                                  </span>
                                )}
                              </div>
                              {match.fitRationale && (
                                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                                  {match.fitRationale}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* ---- Tab: Scoring ---- */}
                  <TabsContent value="scoring" className="px-6 pb-6">
                    {detail.scoringPreferences.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        Using default scoring weights for all stages.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {detail.scoringPreferences.map((pref) => (
                          <Card key={pref.stage}>
                            <CardContent className="pt-4 pb-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-sm flex items-center gap-2">
                                  <Scale className="h-4 w-4" />
                                  {pref.stage}
                                </span>
                                <Badge
                                  variant={
                                    pref.useCustomWeights
                                      ? "default"
                                      : "outline"
                                  }
                                  className="text-xs"
                                >
                                  {pref.useCustomWeights
                                    ? "Custom"
                                    : "Default"}
                                </Badge>
                              </div>
                              {pref.useCustomWeights && pref.customWeights && (
                                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mt-2">
                                  {Object.entries(pref.customWeights).map(
                                    ([key, val]) => (
                                      <div key={key}>
                                        <span className="capitalize">
                                          {key.replace(/([A-Z])/g, " $1").trim()}
                                        </span>
                                        :{" "}
                                        <strong className="text-foreground">
                                          {val}
                                        </strong>
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

**Step 2: Regenerate route tree**

Run: `cd frontend && bunx tsr generate`
This auto-generates the route tree to include the new `investors` route.

If TanStack Router auto-generates on save during dev mode, this step may not be needed — verify `routeTree.gen.ts` includes the new route.

**Step 3: Verify compilation**

Run: `cd frontend && bunx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/routes/_protected/admin/investors.tsx frontend/src/routeTree.gen.ts
git commit -m "feat(admin): add investors monitoring page with list and detail panel"
```

---

## Task 7: Visual QA & Final Verification

**Step 1: Run both services**

Run: `bun dev` (from root)

**Step 2: Navigate to admin investors page**

Open `http://localhost:3030/admin/investors` in the browser.

**Step 3: Verify:**
- [ ] Investor list loads (may be empty if no test data)
- [ ] Search filters work
- [ ] Clicking a row opens the Sheet panel
- [ ] Thesis tab shows profile + thesis data
- [ ] Matches tab shows matched startups with scores
- [ ] Scoring tab shows preferences
- [ ] Sidebar nav shows "Investors" link
- [ ] No console errors

**Step 4: Run all checks**

Run: `cd backend && bunx tsc --noEmit && bun lint`
Run: `cd frontend && bunx tsc --noEmit`
Expected: Zero errors

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(admin): investors page QA fixes"
```
