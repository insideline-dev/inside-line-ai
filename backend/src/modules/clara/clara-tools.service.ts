import { Injectable } from "@nestjs/common";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { tool } from "ai";
import type { AgentMail } from "agentmail";
import { DrizzleService } from "../../database";
import { startup } from "../startup/entities/startup.schema";
import { MatchService } from "../investor/match.service";
import { DealPipelineService } from "../investor/deal-pipeline.service";
import { ThesisService } from "../investor/thesis.service";
import { InvestorNoteService } from "../investor/investor-note.service";
import { PortfolioService } from "../investor/portfolio.service";
import { startupMatch } from "../investor/entities/investor.schema";
import { PdfService } from "../startup/pdf.service";
import { AnalyticsService } from "../admin/analytics.service";
import { StartupService } from "../startup/startup.service";
import type { ClaraAgentRuntimeState } from "./interfaces/clara.interface";
import { ClaraChannelService, type ClaraChannelKind } from "./clara-channel.service";

type BuildToolsInput =
  | string
  | null
  | {
      actorUserId: string | null;
      actorRole?: string | null;
      linkedStartupId?: string | null;
      channel?: ClaraChannelKind;
      inboxId?: string;
      inReplyToMessageId?: string;
      runtime?: ClaraAgentRuntimeState;
    };

type ResolvedToolActor = {
  actorUserId: string | null;
  actorRole: string | null;
  linkedStartupId: string | null;
  channel: ClaraChannelKind;
  inboxId: string | null;
  inReplyToMessageId: string | null;
  runtime?: ClaraAgentRuntimeState;
};

type AccessibleStartupRow = {
  id: string;
  name: string;
  status: string;
  overallScore: number | null;
  stage: string;
  industry: string;
  tagline?: string | null;
  description?: string | null;
  website?: string | null;
  location?: string | null;
  fundingTarget?: number | null;
  teamSize?: number | null;
  teamMembers?: unknown;
  valuation?: number | null;
  contactEmail?: string | null;
  contactName?: string | null;
  submittedAt?: Date | null;
  createdAt?: Date;
};

@Injectable()
export class ClaraToolsService {
  constructor(
    private drizzle: DrizzleService,
    private matchService: MatchService,
    private pipelineService: DealPipelineService,
    private thesisService: ThesisService,
    private noteService: InvestorNoteService,
    private portfolioService: PortfolioService,
    private claraChannel: ClaraChannelService,
    private pdfService: PdfService,
    private analyticsService: AnalyticsService,
    private startupService: StartupService,
  ) {}

  buildTools(input: BuildToolsInput) {
    const actor = this.normalizeActor(input);
    const noAccount =
      "No Inside Line account is linked to this email address. The sender may need to register on Inside Line first.";
    const notAdmin = "This action requires an admin account.";
    const notInvestor =
      "This action requires an investor account linked to the sender email.";

    return {
      getMyMatches: tool({
        description:
          "Get the investor's matched startups with scores, status, and fit rationale",
        inputSchema: z.object({
          limit: z.number().min(1).max(20).default(10).describe("Max results to return"),
        }),
        execute: async ({ limit }) => {
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isInvestor(actor)) return { message: notInvestor };
          const result = await this.matchService.findAll(actor.actorUserId, {
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
            fitRationale: m.fitRationale,
            status: m.status,
            isSaved: m.isSaved,
          }));
        },
      }),

      getMyPipeline: tool({
        description:
          "Get the investor's deal pipeline grouped by status (new, reviewing, engaged, closed, passed)",
        inputSchema: z.object({}),
        execute: async () => {
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isInvestor(actor)) return { message: notInvestor };
          const result = await this.pipelineService.getPipeline(actor.actorUserId);
          return { stats: result.stats };
        },
      }),

      getMyThesis: tool({
        description:
          "Get the investor's investment thesis including target industries, stages, check size, narrative, and AI summary",
        inputSchema: z.object({}),
        execute: async () => {
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isInvestor(actor)) return { message: notInvestor };
          const thesis = await this.thesisService.findOne(actor.actorUserId);
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
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isInvestor(actor)) return { message: notInvestor };

          if (startupName) {
            const match = await this.resolveStartupForActor({
              actor,
              name: startupName,
            });
            if (!match) return { message: `No accessible startup found matching "${startupName}".` };
            return this.noteService.getNotes(actor.actorUserId, match.id);
          }

          return this.noteService.getAllNotes(actor.actorUserId);
        },
      }),

      getMyPortfolio: tool({
        description: "Get the investor's portfolio companies with deal details",
        inputSchema: z.object({}),
        execute: async () => {
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isInvestor(actor)) return { message: notInvestor };
          return this.portfolioService.getPortfolio(actor.actorUserId);
        },
      }),

      getStartupDetails: tool({
        description:
          "Get detailed information about a startup by name (fuzzy search). Returns profile, scores, stage, industry, team, and funding details. Access is scoped to the sender role.",
        inputSchema: z.object({
          name: z.string().describe("Startup name to search for"),
        }),
        execute: async ({ name }) => {
          const result = await this.resolveStartupForActor({ actor, name, detailed: true });
          if (!result) {
            return { message: `No accessible startup found matching "${name}".` };
          }
          return result;
        },
      }),

      getStartupStatus: tool({
        description:
          "Quick status check for a startup by name. Returns name, status, overall score, and stage.",
        inputSchema: z.object({
          name: z.string().describe("Startup name to check"),
        }),
        execute: async ({ name }) => {
          const result = await this.resolveStartupForActor({ actor, name });
          if (!result) {
            return { message: `No accessible startup found matching "${name}".` };
          }
          return {
            id: result.id,
            name: result.name,
            status: result.status,
            overallScore: result.overallScore,
            stage: result.stage,
          };
        },
      }),

      getStartupProgress: tool({
        description:
          "Get detailed analysis pipeline progress for a startup by name or startup ID. Returns stages, status, and completion progress.",
        inputSchema: z.object({
          startupId: z.string().optional(),
          name: z.string().optional(),
        }),
        execute: async ({ startupId, name }) => {
          if (!actor.actorUserId) return { message: noAccount };
          const target = await this.resolveStartupForActor({
            actor,
            startupId,
            name: name ?? undefined,
          });
          if (!target) {
            return {
              message: startupId
                ? `No accessible startup found for ID "${startupId}".`
                : `No accessible startup found matching "${name ?? ""}".`,
            };
          }

          if (this.isAdmin(actor)) {
            return this.startupService.adminGetProgress(target.id);
          }

          return this.startupService.getProgress(target.id, actor.actorUserId);
        },
      }),

      searchStartups: tool({
        description:
          "Search startups by name. Investor searches are access-scoped; admin searches span the platform.",
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
              isPrivate: startup.isPrivate,
              overallScore: startup.overallScore,
            })
            .from(startup)
            .where(and(ilike(startup.name, escaped), this.buildStartupAccessFilter(actor)))
            .orderBy(desc(startup.createdAt))
            .limit(limit);
        },
      }),

      getAvailableStartups: tool({
        description:
          "List startups available to the sender (role-scoped) with status, stage, and score for quick review.",
        inputSchema: z.object({
          limit: z.number().min(1).max(20).default(10),
        }),
        execute: async ({ limit }) => {
          return this.drizzle.db
            .select({
              id: startup.id,
              name: startup.name,
              status: startup.status,
              stage: startup.stage,
              industry: startup.industry,
              overallScore: startup.overallScore,
              createdAt: startup.createdAt,
            })
            .from(startup)
            .where(this.buildStartupAccessFilter(actor))
            .orderBy(desc(startup.createdAt))
            .limit(limit);
        },
      }),

      getPlatformAnalytics: tool({
        description:
          "Admin-only platform analytics: overview, startup stats, or investor stats.",
        inputSchema: z.object({
          scope: z.enum(["overview", "startups", "investors"]).default("overview"),
          days: z.number().min(1).max(365).default(30),
        }),
        execute: async ({ scope, days }) => {
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isAdmin(actor)) return { message: notAdmin };

          if (scope === "overview") return this.analyticsService.getOverview();
          if (scope === "startups") return this.analyticsService.getStartupStats(days);
          return this.analyticsService.getInvestorStats();
        },
      }),

      sendStartupReportPdf: tool({
        description:
          "Email the analysis report PDF as an attachment in this email thread for the linked or requested startup.",
        inputSchema: z.object({
          startupId: z.string().optional(),
          startupName: z.string().optional(),
        }),
        execute: async ({ startupId, startupName }) => {
          return this.sendStartupPdfAttachment({
            actor,
            kind: "report",
            startupId,
            startupName,
          });
        },
      }),

      sendStartupMemoPdf: tool({
        description:
          "Email the investment memo PDF as an attachment in this email thread for the linked or requested startup.",
        inputSchema: z.object({
          startupId: z.string().optional(),
          startupName: z.string().optional(),
        }),
        execute: async ({ startupId, startupName }) => {
          return this.sendStartupPdfAttachment({
            actor,
            kind: "memo",
            startupId,
            startupName,
          });
        },
      }),
    };
  }

  private normalizeActor(input: BuildToolsInput): ResolvedToolActor {
    if (typeof input === "string" || input == null) {
      return {
        actorUserId: input,
        actorRole: input ? "investor" : null,
        linkedStartupId: null,
        channel: "email",
        inboxId: null,
        inReplyToMessageId: null,
      };
    }

    return {
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      linkedStartupId: input.linkedStartupId ?? null,
      channel: input.channel ?? "email",
      inboxId: input.inboxId ?? null,
      inReplyToMessageId: input.inReplyToMessageId ?? null,
      runtime: input.runtime,
    };
  }

  private isAdmin(actor: ResolvedToolActor): boolean {
    return actor.actorRole === "admin";
  }

  private isInvestor(actor: ResolvedToolActor): boolean {
    return actor.actorRole === "investor" || actor.actorRole === "admin";
  }

  private buildStartupAccessFilter(actor: ResolvedToolActor) {
    if (this.isAdmin(actor)) {
      return sql`true`;
    }

    if (!actor.actorUserId) {
      return sql`(${startup.status} = 'approved' AND COALESCE(${startup.isPrivate}, false) = false)`;
    }

    if (actor.actorRole === "investor") {
      return sql`(
        ${startup.userId} = ${actor.actorUserId}
        OR EXISTS (
          SELECT 1
          FROM ${startupMatch}
          WHERE ${startupMatch.startupId} = ${startup.id}
            AND ${startupMatch.investorId} = ${actor.actorUserId}
        )
        OR (${startup.status} = 'approved' AND COALESCE(${startup.isPrivate}, false) = false)
      )`;
    }

    return sql`${startup.userId} = ${actor.actorUserId}`;
  }

  private async resolveStartupForActor(params: {
    actor: ResolvedToolActor;
    startupId?: string;
    name?: string;
    detailed?: boolean;
  }): Promise<AccessibleStartupRow | null> {
    const { actor, startupId, name, detailed = false } = params;

    const selectShape = {
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
      submittedAt: startup.submittedAt,
      createdAt: startup.createdAt,
    };

    if (startupId) {
      const [row] = await this.drizzle.db
        .select(selectShape)
        .from(startup)
        .where(and(eq(startup.id, startupId), this.buildStartupAccessFilter(actor)))
        .limit(1);
      return row ?? null;
    }

    const effectiveName = name?.trim();
    if (!effectiveName && actor.linkedStartupId) {
      const [row] = await this.drizzle.db
        .select(selectShape)
        .from(startup)
        .where(and(eq(startup.id, actor.linkedStartupId), this.buildStartupAccessFilter(actor)))
        .limit(1);
      return row ?? null;
    }

    if (!effectiveName) return null;

    let row:
      | (AccessibleStartupRow & {
          similarity?: number;
        })
      | null = null;
    try {
      const [fuzzyRow] = await this.drizzle.db
        .select({
          ...selectShape,
          similarity: sql<number>`similarity(${startup.name}, CAST(${effectiveName} AS text))`.as("similarity"),
        })
        .from(startup)
        .where(
          and(
            sql`similarity(${startup.name}, CAST(${effectiveName} AS text)) > 0.3`,
            this.buildStartupAccessFilter(actor),
          ),
        )
        .orderBy(desc(sql`similarity(${startup.name}, CAST(${effectiveName} AS text))`))
        .limit(1);
      row = fuzzyRow ?? null;
    } catch (error) {
      if (!this.isSimilarityUnavailable(error)) {
        throw error;
      }

      const [fallbackRow] = await this.drizzle.db
        .select(selectShape)
        .from(startup)
        .where(
          and(
            ilike(startup.name, `%${effectiveName}%`),
            this.buildStartupAccessFilter(actor),
          ),
        )
        .orderBy(desc(startup.createdAt))
        .limit(1);
      row = fallbackRow ?? null;
    }

    if (!row) return null;
    if (!detailed) {
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        overallScore: row.overallScore,
        stage: row.stage,
        industry: row.industry,
      };
    }

    return row;
  }

  private isSimilarityUnavailable(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /function similarity\(/i.test(message) && /does not exist/i.test(message);
  }

  private async sendStartupPdfAttachment(params: {
    actor: ResolvedToolActor;
    kind: "memo" | "report";
    startupId?: string;
    startupName?: string;
  }) {
    const { actor, kind, startupId, startupName } = params;

    if (!actor.actorUserId) {
      return {
        sent: false,
        message:
          "No Inside Line account is linked to this sender, so I cannot generate a startup PDF from the platform.",
      };
    }

    if (!actor.inboxId || !actor.inReplyToMessageId) {
      return {
        sent: false,
        message: "This email thread context is missing, so I could not send the PDF attachment.",
      };
    }

    const target = await this.resolveStartupForActor({
      actor,
      startupId,
      name: startupName,
    });

    if (!target) {
      return {
        sent: false,
        message: startupName
          ? `I could not find an accessible startup matching "${startupName}".`
          : "I could not determine which startup to attach a PDF for.",
      };
    }

    const buffer =
      kind === "memo"
        ? await this.pdfService.generateMemo(target.id, actor.actorUserId)
        : await this.pdfService.generateReport(target.id, actor.actorUserId);

    const safeName = (target.name ?? "startup")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "startup";

    const filename = `${safeName}-${kind}.pdf`;
    const text =
      kind === "memo"
        ? `Attached is the investment memo PDF for ${target.name}.`
        : `Attached is the analysis report PDF for ${target.name}.`;

    const attachments: AgentMail.SendAttachment[] = [
      {
        filename,
        contentType: "application/pdf",
        content: buffer.toString("base64"),
      },
    ];

    await this.claraChannel.reply({
      channel: actor.channel,
      email:
        actor.channel === "email"
          ? {
              inboxId: actor.inboxId!,
              inReplyToMessageId: actor.inReplyToMessageId!,
            }
          : undefined,
      text,
      attachments,
    });

    if (actor.runtime) {
      actor.runtime.replyHandled = true;
      actor.runtime.replyText = text;
      actor.runtime.replyAttachments = [{ filename, contentType: "application/pdf" }];
    }

    return {
      sent: true,
      startupId: target.id,
      startupName: target.name,
      kind,
      filename,
    };
  }
}
