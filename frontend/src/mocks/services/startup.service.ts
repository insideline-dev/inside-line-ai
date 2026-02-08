import type { Startup, StartupWithEvaluation, StartupStatus, StartupFormData, FundingStage } from "@/types";
import { mockStartups } from "../data/startups";
import { getMockEvaluationByStartupId } from "../data/evaluations";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let startups = [...mockStartups];
let nextId = Math.max(...startups.map((s) => parseInt(s.id))) + 1;

export const mockStartupService = {
  // List startups
  async list(filters?: {
    status?: StartupStatus;
    stage?: FundingStage;
    userId?: string;
    scoutId?: string;
    isPrivate?: boolean;
    investorId?: string;
    search?: string;
  }): Promise<Startup[]> {
    await delay(200);
    let results = [...startups];

    if (filters?.status) {
      results = results.filter((s) => s.status === filters.status);
    }
    if (filters?.stage) {
      results = results.filter((s) => s.stage === filters.stage);
    }
    if (filters?.userId) {
      results = results.filter((s) => s.userId === filters.userId);
    }
    if (filters?.scoutId) {
      results = results.filter((s) => s.scoutId === filters.scoutId);
    }
    if (filters?.isPrivate !== undefined) {
      results = results.filter((s) => s.isPrivate === filters.isPrivate);
    }
    if (filters?.investorId) {
      results = results.filter((s) => s.isPrivate && s.userId === filters.investorId);
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          s.description?.toLowerCase().includes(search) ||
          s.industry?.toLowerCase().includes(search)
      );
    }

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  // Get single startup with evaluation
  async getById(id: string): Promise<StartupWithEvaluation | null> {
    await delay(150);
    const startup = startups.find((s) => s.id === id);
    if (!startup) return null;

    const evaluation = getMockEvaluationByStartupId(id);
    return { ...startup, evaluation };
  },

  // Create startup
  async create(data: StartupFormData, submittedByRole: "founder" | "investor" | "scout", userId: string): Promise<Startup> {
    await delay(500);
    const newStartup: Startup = {
      id: String(nextId++),
      userId: userId,
      submittedByRole,
      scoutId: submittedByRole === "scout" ? userId : undefined,
      isPrivate: submittedByRole === "investor",
      name: data.name,
      slug: data.name.toLowerCase().replace(/\s+/g, '-'),
      tagline: data.tagline || '',
      website: data.website,
      description: data.description,
      location: data.location,
      stage: data.stage,
      sectorIndustryGroup: data.sectorIndustryGroup,
      sectorIndustry: data.sectorIndustry,
      fundingTarget: data.fundingTarget,
      roundCurrency: data.roundCurrency,
      valuation: data.valuation,
      valuationKnown: data.valuationKnown,
      valuationType: data.valuationType,
      raiseType: data.raiseType,
      leadSecured: data.leadSecured,
      leadInvestorName: data.leadInvestorName,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      contactPhoneCountryCode: data.contactPhoneCountryCode,
      hasPreviousFunding: data.hasPreviousFunding,
      previousFundingAmount: data.previousFundingAmount,
      previousFundingCurrency: data.previousFundingCurrency,
      previousInvestors: data.previousInvestors,
      previousRoundType: data.previousRoundType,
      productDescription: data.productDescription,
      demoVideoUrl: data.demoVideoUrl,
      teamMembers: data.teamMembers,
      status: "submitted",
      createdAt: new Date().toISOString(),
    };

    startups.push(newStartup);
    return newStartup;
  },

  // Update startup
  async update(id: string, data: Partial<Startup>): Promise<Startup> {
    await delay(300);
    const index = startups.findIndex((s) => s.id === id);
    if (index === -1) throw new Error("Startup not found");

    startups[index] = {
      ...startups[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    return startups[index];
  },

  // Update status (admin action)
  async updateStatus(id: string, status: StartupStatus): Promise<Startup> {
    return this.update(id, { status });
  },

  // Delete startup
  async delete(id: string): Promise<void> {
    await delay(200);
    const index = startups.findIndex((s) => s.id === id);
    if (index === -1) throw new Error("Startup not found");
    startups.splice(index, 1);
  },

  // Get analysis progress
  async getProgress(id: string) {
    await delay(100);
    const evaluation = getMockEvaluationByStartupId(id);
    return evaluation?.analysisProgress ?? null;
  },

  // Admin: Get all startups for review
  async getForReview(): Promise<Startup[]> {
    await delay(200);
    return startups
      .filter((s) => s.status === "pending_review" || s.status === "analyzing")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  // Stats
  async getStats() {
    await delay(150);
    return {
      total: startups.length,
      byStatus: {
        submitted: startups.filter((s) => s.status === "submitted").length,
        analyzing: startups.filter((s) => s.status === "analyzing").length,
        pending_review: startups.filter((s) => s.status === "pending_review").length,
        approved: startups.filter((s) => s.status === "approved").length,
        rejected: startups.filter((s) => s.status === "rejected").length,
      },
      averageScore: startups.filter((s) => s.overallScore).reduce((acc, s) => acc + (s.overallScore || 0), 0) / startups.filter((s) => s.overallScore).length || 0,
    };
  },
};
