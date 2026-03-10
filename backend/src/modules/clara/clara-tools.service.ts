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
import type {
  CopilotActionExecutionResult,
  CopilotPendingAction,
} from "../copilot/interfaces/copilot.interface";
import type { CreateNote, UpdateMatchStatus } from "../investor/dto";
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

      proposeCreateNote: tool({
        description:
          "Prepare a new investor note for a startup. This only proposes the change and requires a confirmation reply before execution.",
        inputSchema: z.object({
          startupName: z.string().optional(),
          content: z.string().min(1).max(5000),
          category: z.string().max(100).optional(),
          isPinned: z.boolean().optional(),
        }),
        execute: async ({ startupName, content, category, isPinned }) => {
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isInvestor(actor)) return { message: notInvestor };

          const target = await this.resolveStartupForActor({
            actor,
            name: startupName ?? undefined,
          });
          if (!target) {
            return {
              message: startupName
                ? `No accessible startup found matching "${startupName}".`
                : "I couldn't determine which startup to add a note for.",
            };
          }

          return this.proposePendingAction(actor, {
            actionKey: "create_note",
            confirmationMessage: `I can create a note for ${target.name}. Reply CONFIRM to continue or CANCEL to stop.`,
            successMessage: `The note for ${target.name} was saved.`,
            targetSummary: target.name,
            startupId: target.id,
            payload: {
              startupId: target.id,
              content,
              category,
              isPinned,
            },
          });
        },
      }),

      proposeUpdateNote: tool({
        description:
          "Prepare an update to an existing investor note by note ID. This only proposes the change and requires confirmation.",
        inputSchema: z.object({
          noteId: z.string().uuid(),
          content: z.string().min(1).max(5000).optional(),
          category: z.string().max(100).optional(),
          isPinned: z.boolean().optional(),
        }),
        execute: async ({ noteId, content, category, isPinned }) => {
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isInvestor(actor)) return { message: notInvestor };

          return this.proposePendingAction(actor, {
            actionKey: "update_note",
            confirmationMessage:
              "I can update that note. Reply CONFIRM to continue or CANCEL to stop.",
            successMessage: "The note was updated.",
            targetSummary: noteId,
            noteId,
            payload: {
              noteId,
              content,
              category,
              isPinned,
            },
          });
        },
      }),

      proposeToggleSavedMatch: tool({
        description:
          "Prepare a save/unsave toggle for an investor match by startup name. This only proposes the change and requires confirmation.",
        inputSchema: z.object({
          startupName: z.string().optional(),
        }),
        execute: async ({ startupName }) => {
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isInvestor(actor)) return { message: notInvestor };

          const target = await this.resolveStartupForActor({
            actor,
            name: startupName ?? undefined,
          });
          if (!target) {
            return {
              message: startupName
                ? `No accessible startup found matching "${startupName}".`
                : "I couldn't determine which startup to save or unsave.",
            };
          }

          return this.proposePendingAction(actor, {
            actionKey: "toggle_saved_match",
            confirmationMessage: `I can update the saved state for ${target.name}. Reply CONFIRM to continue or CANCEL to stop.`,
            successMessage: `${target.name} was updated in your saved matches.`,
            targetSummary: target.name,
            startupId: target.id,
            payload: {
              startupId: target.id,
            },
          });
        },
      }),

      proposeUpdateMatchStatus: tool({
        description:
          "Prepare an investor match status update for a startup. This only proposes the change and requires confirmation.",
        inputSchema: z.object({
          startupName: z.string().optional(),
          status: z.enum(["new", "reviewing", "engaged", "closed", "passed"]),
          passReason: z.string().max(500).optional(),
          passNotes: z.string().max(5000).optional(),
          investmentAmount: z.number().positive().optional(),
          investmentCurrency: z.string().max(10).optional(),
          investmentDate: z.string().datetime().optional(),
          investmentNotes: z.string().max(5000).optional(),
          meetingRequested: z.boolean().optional(),
        }),
        execute: async ({ startupName, ...statusUpdate }) => {
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isInvestor(actor)) return { message: notInvestor };

          const target = await this.resolveStartupForActor({
            actor,
            name: startupName ?? undefined,
          });
          if (!target) {
            return {
              message: startupName
                ? `No accessible startup found matching "${startupName}".`
                : "I couldn't determine which startup match to update.",
            };
          }

          const match = await this.resolveMatchForActor(actor, target.id);
          if (!match) {
            return {
              message: `No accessible investor match found for ${target.name}.`,
            };
          }

          return this.proposePendingAction(actor, {
            actionKey: "update_match_status",
            confirmationMessage: `I can change ${target.name} to ${statusUpdate.status}. Reply CONFIRM to continue or CANCEL to stop.`,
            successMessage: `${target.name} was moved to ${statusUpdate.status}.`,
            targetSummary: target.name,
            startupId: target.id,
            matchId: match.id,
            payload: {
              matchId: match.id,
              ...statusUpdate,
            },
          });
        },
      }),

      proposeReanalyzeStartup: tool({
        description:
          "Prepare an admin-only startup reanalysis. This only proposes the change and requires confirmation.",
        inputSchema: z.object({
          startupName: z.string().optional(),
          startupId: z.string().optional(),
        }),
        execute: async ({ startupName, startupId }) => {
          if (!actor.actorUserId) return { message: noAccount };
          if (!this.isAdmin(actor)) return { message: notAdmin };

          const target = await this.resolveStartupForActor({
            actor,
            startupId,
            name: startupName ?? undefined,
          });
          if (!target) {
            return {
              message:
                startupName || startupId
                  ? `No accessible startup found for "${startupName ?? startupId}".`
                  : "I couldn't determine which startup to reanalyze.",
            };
          }

          return this.proposePendingAction(actor, {
            actionKey: "reanalyze_startup",
            confirmationMessage: `I can re-run the analysis for ${target.name}. Reply CONFIRM to continue or CANCEL to stop.`,
            successMessage: `${target.name} has been queued for reanalysis.`,
            targetSummary: target.name,
            startupId: target.id,
            payload: {
              startupId: target.id,
            },
          });
        },
      }),
    };
  }

  async executePendingAction(
    pendingAction: CopilotPendingAction,
    actor: {
      actorUserId: string | null;
      actorRole: string | null;
    },
  ): Promise<CopilotActionExecutionResult> {
    if (!actor.actorUserId) {
      throw new Error(
        "No Inside Line account is linked to this sender, so I cannot complete that action.",
      );
    }

    switch (pendingAction.actionKey) {
      case "create_note": {
        const result = await this.noteService.create(
          actor.actorUserId,
          pendingAction.payload as unknown as CreateNote,
        );
        return {
          message: pendingAction.successMessage,
          result,
        };
      }
      case "update_note": {
        const { noteId, ...updatePayload } = pendingAction.payload;
        if (typeof noteId !== "string") {
          throw new Error("The pending note update is missing its note ID.");
        }
        const result = await this.noteService.update(
          noteId,
          actor.actorUserId,
          updatePayload,
        );
        return {
          message: pendingAction.successMessage,
          result,
        };
      }
      case "toggle_saved_match": {
        const startupId = pendingAction.payload.startupId;
        if (typeof startupId !== "string") {
          throw new Error("The pending saved-match update is missing its startup.");
        }
        const result = await this.matchService.toggleSaved(actor.actorUserId, startupId);
        return {
          message: pendingAction.successMessage,
          result,
        };
      }
      case "update_match_status": {
        const matchId = pendingAction.payload.matchId;
        if (typeof matchId !== "string") {
          throw new Error("The pending match-status update is missing its match ID.");
        }
        const updatePayload: UpdateMatchStatus = {
          status: pendingAction.payload.status as UpdateMatchStatus["status"],
        };
        const result = await this.matchService.updateMatchStatus(
          actor.actorUserId,
          matchId,
          updatePayload,
        );
        return {
          message: pendingAction.successMessage,
          result,
        };
      }
      case "reanalyze_startup": {
        if (actor.actorRole !== "admin") {
          throw new Error("This action requires an admin account.");
        }
        const startupId = pendingAction.payload.startupId;
        if (typeof startupId !== "string") {
          throw new Error("The pending reanalysis request is missing its startup.");
        }
        const result = await this.startupService.reanalyze(startupId, actor.actorUserId);
        return {
          message: pendingAction.successMessage,
          result,
        };
      }
      default:
        throw new Error(`Unsupported pending action: ${pendingAction.actionKey}`);
    }
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

  private async resolveMatchForActor(
    actor: ResolvedToolActor,
    startupId: string,
  ): Promise<{ id: string; startupId: string } | null> {
    if (!actor.actorUserId || actor.actorRole !== "investor") {
      return null;
    }

    const [row] = await this.drizzle.db
      .select({
        id: startupMatch.id,
        startupId: startupMatch.startupId,
      })
      .from(startupMatch)
      .where(
        and(
          eq(startupMatch.investorId, actor.actorUserId),
          eq(startupMatch.startupId, startupId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  private isSimilarityUnavailable(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /function similarity\(/i.test(message) && /does not exist/i.test(message);
  }

  private proposePendingAction(actor: ResolvedToolActor, pendingAction: CopilotPendingAction) {
    if (actor.runtime) {
      actor.runtime.pendingAction = pendingAction;
    }

    return {
      proposed: true,
      requiresConfirmation: true,
      message: pendingAction.confirmationMessage,
      actionKey: pendingAction.actionKey,
      targetSummary: pendingAction.targetSummary,
    };
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
