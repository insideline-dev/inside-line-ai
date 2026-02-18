import { Injectable } from "@nestjs/common";
import { ilike, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { tool } from "ai";
import { DrizzleService } from "../../database";
import { startup } from "../startup/entities/startup.schema";
import { MatchService } from "../investor/match.service";
import { DealPipelineService } from "../investor/deal-pipeline.service";
import { ThesisService } from "../investor/thesis.service";
import { InvestorNoteService } from "../investor/investor-note.service";
import { PortfolioService } from "../investor/portfolio.service";

@Injectable()
export class ClaraToolsService {
  constructor(
    private drizzle: DrizzleService,
    private matchService: MatchService,
    private pipelineService: DealPipelineService,
    private thesisService: ThesisService,
    private noteService: InvestorNoteService,
    private portfolioService: PortfolioService,
  ) {}

  buildTools(investorUserId: string | null) {
    const noAccount = "No investor account is linked to this email address. The sender may need to register on Inside Line first.";

    return {
      getMyMatches: tool({
        description: "Get the investor's matched startups with scores, status, and fit rationale",
        inputSchema: z.object({
          limit: z.number().min(1).max(20).default(10).describe("Max results to return"),
        }),
        execute: async ({ limit }) => {
          if (!investorUserId) return { message: noAccount };
          const result = await this.matchService.findAll(investorUserId, {
            page: 1,
            limit,
          });
          return result.data.map((m) => ({
            startupId: m.startupId,
            startupName: (m as Record<string, unknown>).startupName ?? "Unknown",
            overallScore: m.overallScore,
            marketScore: m.marketScore,
            teamScore: m.teamScore,
            productScore: m.productScore,
            tractionScore: m.tractionScore,
            financialsScore: m.financialsScore,
            matchReason: m.matchReason,
            status: m.status,
            isSaved: m.isSaved,
          }));
        },
      }),

      getMyPipeline: tool({
        description: "Get the investor's deal pipeline grouped by status (new, reviewing, engaged, closed, passed)",
        inputSchema: z.object({}),
        execute: async () => {
          if (!investorUserId) return { message: noAccount };
          const result = await this.pipelineService.getPipeline(investorUserId);
          return { stats: result.stats };
        },
      }),

      getStartupDetails: tool({
        description: "Get detailed information about a startup by name (fuzzy search). Returns full profile including scores, stage, industry, team, and funding details.",
        inputSchema: z.object({
          name: z.string().describe("Startup name to search for"),
        }),
        execute: async ({ name }) => {
          const results = await this.drizzle.db
            .select({
              id: startup.id,
              name: startup.name,
              tagline: startup.tagline,
              description: startup.description,
              website: startup.website,
              location: startup.location,
              industry: startup.industry,
              stage: startup.stage,
              status: startup.status,
              overallScore: startup.overallScore,
              fundingTarget: startup.fundingTarget,
              teamSize: startup.teamSize,
              teamMembers: startup.teamMembers,
              valuation: startup.valuation,
              contactEmail: startup.contactEmail,
              contactName: startup.contactName,
              similarity: sql<number>`similarity(${startup.name}, ${name})`.as("similarity"),
            })
            .from(startup)
            .where(sql`similarity(${startup.name}, ${name}) > 0.3`)
            .orderBy(desc(sql`similarity(${startup.name}, ${name})`))
            .limit(3);

          if (results.length === 0) {
            return { message: `No startups found matching "${name}".` };
          }
          return results;
        },
      }),

      getStartupStatus: tool({
        description: "Quick status check for a startup by name. Returns name, status, overall score, and stage.",
        inputSchema: z.object({
          name: z.string().describe("Startup name to check"),
        }),
        execute: async ({ name }) => {
          const results = await this.drizzle.db
            .select({
              id: startup.id,
              name: startup.name,
              status: startup.status,
              overallScore: startup.overallScore,
              stage: startup.stage,
            })
            .from(startup)
            .where(sql`similarity(${startup.name}, ${name}) > 0.3`)
            .orderBy(desc(sql`similarity(${startup.name}, ${name})`))
            .limit(1);

          if (results.length === 0) {
            return { message: `No startup found matching "${name}".` };
          }
          return results[0];
        },
      }),

      getMyThesis: tool({
        description: "Get the investor's investment thesis including target industries, stages, check size, and narrative",
        inputSchema: z.object({}),
        execute: async () => {
          if (!investorUserId) return { message: noAccount };
          const thesis = await this.thesisService.findOne(investorUserId);
          if (!thesis) return { message: "No investment thesis has been set up yet." };
          return thesis;
        },
      }),

      getMyNotes: tool({
        description: "Get the investor's notes, optionally filtered by startup name",
        inputSchema: z.object({
          startupName: z.string().optional().describe("Filter notes by startup name"),
        }),
        execute: async ({ startupName }) => {
          if (!investorUserId) return { message: noAccount };

          if (startupName) {
            const [match] = await this.drizzle.db
              .select({ id: startup.id })
              .from(startup)
              .where(sql`similarity(${startup.name}, ${startupName}) > 0.3`)
              .orderBy(desc(sql`similarity(${startup.name}, ${startupName})`))
              .limit(1);

            if (!match) return { message: `No startup found matching "${startupName}".` };
            return this.noteService.getNotes(investorUserId, match.id);
          }

          return this.noteService.getAllNotes(investorUserId);
        },
      }),

      getMyPortfolio: tool({
        description: "Get the investor's portfolio companies with deal details",
        inputSchema: z.object({}),
        execute: async () => {
          if (!investorUserId) return { message: noAccount };
          return this.portfolioService.getPortfolio(investorUserId);
        },
      }),

      searchStartups: tool({
        description: "Search startups by name across the platform",
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          limit: z.number().min(1).max(10).default(5).describe("Max results"),
        }),
        execute: async ({ query, limit }) => {
          const escaped = `%${query}%`;
          return this.drizzle.db
            .select({
              id: startup.id,
              name: startup.name,
              industry: startup.industry,
              stage: startup.stage,
              status: startup.status,
              overallScore: startup.overallScore,
            })
            .from(startup)
            .where(ilike(startup.name, escaped))
            .limit(limit);
        },
      }),
    };
  }
}
