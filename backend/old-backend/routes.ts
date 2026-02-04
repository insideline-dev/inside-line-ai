import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { insertStartupSchema, insertInvestmentThesisSchema, insertInvestorPortalSettingsSchema, insertScoutApplicationSchema } from "@shared/schema";
import { z } from "zod";
import { ObjectStorageService, registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { reanalyzeSection, SectionName } from "./agents";
import { queueAnalysis, analysisQueue } from "./analysis-queue";
import { setupAuth } from "./replit_integrations/auth";
import { generateStartupMemoPDF, generateStartupReportPDF } from "./pdf-generator";
import { communicationAgent } from "./communication-agent";
import { validateTwilioWebhook } from "./integrations/twilio";

// Module-level webhook event deduplication cache (TTL: 5 minutes)
const processedWebhookEvents = new Map<string, number>();
const WEBHOOK_DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup old entries periodically (runs once at module load)
setInterval(() => {
  const now = Date.now();
  for (const [eventId, timestamp] of processedWebhookEvents.entries()) {
    if (now - timestamp > WEBHOOK_DEDUP_TTL_MS) {
      processedWebhookEvents.delete(eventId);
    }
  }
}, 60 * 1000); // Cleanup every minute

// Helper to check if user is authenticated
function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Helper to get user ID from request (OIDC stores ID in claims.sub)
function getUserId(req: Request): string {
  const user = req.user as any;
  return user?.claims?.sub || user?.id || "";
}

// Role-based authorization middleware
async function requireRole(req: Request, res: Response, next: () => void, allowedRoles: string[]) {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const profile = await storage.getUserProfile(userId);
  const userRole = profile?.role || "founder";
  
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({ error: "Forbidden - insufficient permissions" });
  }
  
  next();
}

function requireAdmin(req: Request, res: Response, next: () => void) {
  return requireRole(req, res, next, ["admin"]);
}

function requireInvestor(req: Request, res: Response, next: () => void) {
  return requireRole(req, res, next, ["investor", "admin"]);
}

function requireScout(req: Request, res: Response, next: () => void) {
  return requireRole(req, res, next, ["scout", "admin"]);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup Replit Auth (optional for local dev)
  if (process.env.REPL_ID && process.env.SESSION_SECRET) {
    await setupAuth(app);
  } else {
    console.warn("[Auth] Using mock auth for local dev");

    // Seed mock user on startup
    try {
      const mockUserId = "dev-user-123";
      await storage.upsertUser({
        id: mockUserId,
        email: "dev@local.test",
        firstName: "Dev",
        lastName: "User",
      });

      const profile = await storage.getUserProfile(mockUserId);
      if (!profile) {
        await storage.createUserProfile({
          userId: mockUserId,
          role: "admin",
        });
        console.log("[Auth] Created mock admin user");
      }
    } catch (error) {
      console.error("[Auth] Failed to seed mock user:", error);
    }

    // Mock auth middleware - auto-login as admin in dev mode
    app.use((req, res, next) => {
      if (!req.user) {
        req.user = {
          claims: {
            sub: "dev-user-123",
            email: "dev@local.test",
            first_name: "Dev",
            last_name: "User",
          },
          id: "dev-user-123",
        };
      }
      next();
    });

    // Mock login endpoint
    app.get("/api/login", (req, res) => {
      res.redirect("/");
    });

    // Mock logout endpoint
    app.get("/api/logout", (req, res) => {
      res.redirect("/");
    });
  }
  
  // Register Object Storage routes (for file uploads and serving)
  registerObjectStorageRoutes(app);
  
  // ================== AUTH ROUTES ==================
  
  // Login endpoints - all go through the same OIDC flow
  // Role selection happens after login on /select-role page
  app.get("/api/login/investor", (req, res) => {
    res.redirect("/api/login");
  });

  app.get("/api/login/founder", (req, res) => {
    res.redirect("/api/login");
  });

  app.get("/api/login/scout", (req, res) => {
    res.redirect("/api/login");
  });

  app.get("/api/auth/user", async (req, res) => {
    // Disable caching for auth status
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    if (!req.user) {
      console.log("[auth/user] No user in request");
      return res.json(null);
    }
    
    const userId = getUserId(req);
    console.log("[auth/user] userId:", userId);
    
    const profile = await storage.getUserProfile(userId);
    console.log("[auth/user] profile found:", !!profile, profile?.role);
    
    const response = {
      ...(req.user as any),
      role: profile?.role || null,
      needsRoleSelection: !profile,
    };
    console.log("[auth/user] returning needsRoleSelection:", !profile);
    
    res.json(response);
  });

  // Set role for new users
  app.post("/api/auth/set-role", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { role } = req.body;
      
      if (!role || !["founder", "investor"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      
      let profile = await storage.getUserProfile(userId);
      
      if (profile) {
        return res.status(400).json({ error: "Role already set" });
      }
      
      profile = await storage.createUserProfile({
        userId,
        role,
      });
      
      res.json({ success: true, role: profile.role });
    } catch (error) {
      console.error("Error setting role:", error);
      res.status(500).json({ error: "Failed to set role" });
    }
  });

  // Get current user's profile
  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await storage.getUserProfile(userId);
      res.json(profile || null);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Update current user's profile
  app.patch("/api/profile", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { companyName, title, linkedinUrl, bio } = req.body;
      
      const profile = await storage.updateUserProfile(userId, {
        companyName,
        title,
        linkedinUrl,
        bio,
      });
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // ================== SCOUT APPLICATION ROUTES ==================

  // Submit a scout application (public, but requires auth)
  app.post("/api/scout/apply", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      // Check if user already has an application
      const existingApplication = await storage.getScoutApplicationByUserId(userId);
      if (existingApplication) {
        return res.status(400).json({ 
          error: "You already have a scout application", 
          status: existingApplication.status 
        });
      }
      
      // Check if user already has a role set
      const profile = await storage.getUserProfile(userId);
      if (profile?.role === "scout") {
        return res.status(400).json({ error: "You are already a scout" });
      }
      
      const parseResult = insertScoutApplicationSchema.safeParse({
        ...req.body,
        userId,
      });
      
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0]?.message || "Invalid application data" });
      }
      
      const application = await storage.createScoutApplication(parseResult.data);
      
      res.json(application);
    } catch (error) {
      console.error("Error creating scout application:", error);
      res.status(500).json({ error: "Failed to submit application" });
    }
  });

  // Get current user's scout application status
  app.get("/api/scout/application", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const application = await storage.getScoutApplicationByUserId(userId);
      res.json(application || null);
    } catch (error) {
      console.error("Error fetching scout application:", error);
      res.status(500).json({ error: "Failed to fetch application" });
    }
  });

  // Get scout's submitted startups
  app.get("/api/scout/startups", requireAuth, requireScout, async (req, res) => {
    try {
      const userId = getUserId(req);
      const startups = await storage.getStartupsByScout(userId);
      res.json(startups);
    } catch (error) {
      console.error("Error fetching scout startups:", error);
      res.status(500).json({ error: "Failed to fetch startups" });
    }
  });

  // Scout submits a startup
  app.post("/api/scout/startups", requireAuth, requireScout, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      const startup = await storage.createStartup({
        ...req.body,
        founderId: userId,
        submittedByRole: "scout",
        scoutId: userId,
        status: "submitted",
      });
      
      res.json(startup);
    } catch (error) {
      console.error("Error creating scout startup:", error);
      res.status(500).json({ error: "Failed to submit startup" });
    }
  });

  // Admin: Get all scout applications
  app.get("/api/admin/scout-applications", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status } = req.query;
      const applications = status 
        ? await storage.getScoutApplicationsByStatus(status as string)
        : await storage.getAllScoutApplications();
      res.json(applications);
    } catch (error) {
      console.error("Error fetching scout applications:", error);
      res.status(500).json({ error: "Failed to fetch applications" });
    }
  });

  // Admin: Approve or reject a scout application
  app.patch("/api/admin/scout-applications/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, reviewNotes } = req.body;
      const userId = getUserId(req);
      
      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      const application = await storage.getScoutApplication(id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      
      const updated = await storage.updateScoutApplicationStatus(id, status, userId, reviewNotes);
      
      // If approved, update the user's profile to scout role
      if (status === "approved" && updated) {
        let profile = await storage.getUserProfile(application.userId);
        if (profile) {
          await storage.updateUserProfile(application.userId, { role: "scout" });
        } else {
          await storage.createUserProfile({
            userId: application.userId,
            role: "scout",
          });
        }
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating scout application:", error);
      res.status(500).json({ error: "Failed to update application" });
    }
  });

  // ================== STARTUP ROUTES (Founder) ==================

  // Get current user's startups
  app.get("/api/startups", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const startups = await storage.getStartupsByFounder(userId);
      res.json(startups);
    } catch (error) {
      console.error("Error fetching startups:", error);
      res.status(500).json({ error: "Failed to fetch startups" });
    }
  });

  // Get single startup with evaluation
  app.get("/api/startups/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const startup = await storage.getStartup(id);
      
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      // Verify ownership
      const userId = getUserId(req);
      if (startup.founderId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const evaluation = await storage.getEvaluation(id);
      
      // Fetch LinkedIn profile details for team members - match by name
      const linkedinProfiles: Record<string, any> = {};
      const teamMembers = (evaluation?.comprehensiveResearchData as any)?.extractedData?.teamMembers || [];
      const teamMemberEvals = (evaluation?.teamMemberEvaluations as any[]) || [];
      
      const memberNames = new Set<string>();
      for (const member of teamMembers) {
        if (member.name) memberNames.add(member.name.toLowerCase());
      }
      for (const member of teamMemberEvals) {
        if (member.name) memberNames.add(member.name.toLowerCase());
      }
      
      try {
        const allCachedProfiles = await storage.getAllCachedLinkedinProfiles();
        for (const cached of allCachedProfiles) {
          const profileData = cached.profileData as any;
          if (profileData?.name) {
            const profileNameLower = profileData.name.toLowerCase();
            if (memberNames.has(profileNameLower)) {
              linkedinProfiles[profileNameLower] = profileData;
            }
          }
        }
      } catch (err) {}
      
      res.json({ ...startup, evaluation, linkedinProfiles });
    } catch (error) {
      console.error("Error fetching startup:", error);
      res.status(500).json({ error: "Failed to fetch startup" });
    }
  });

  // Get analysis progress for a startup
  app.get("/api/startups/:id/progress", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const startup = await storage.getStartup(id);
      
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      const evaluation = await storage.getEvaluation(id);
      const analysisProgress = evaluation?.analysisProgress || null;
      
      res.json({
        status: startup.status,
        progress: analysisProgress,
      });
    } catch (error) {
      console.error("Error fetching analysis progress:", error);
      res.status(500).json({ error: "Failed to fetch analysis progress" });
    }
  });

  // Create new startup submission
  app.post("/api/startups", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      const parsed = insertStartupSchema.safeParse({
        ...req.body,
        founderId: userId,
        status: "submitted",
      });
      
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      
      const startup = await storage.createStartup(parsed.data);
      
      // Queue analysis (max 3 concurrent, rest wait in queue)
      queueAnalysis(startup.id);
      
      res.status(201).json(startup);
    } catch (error) {
      console.error("Error creating startup:", error);
      res.status(500).json({ error: "Failed to create startup" });
    }
  });

  // ================== DRAFT ROUTES ==================

  // Get all drafts for the current founder
  app.get("/api/drafts", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const drafts = await storage.getDraftsByFounder(userId);
      res.json(drafts);
    } catch (error) {
      console.error("Error fetching drafts:", error);
      res.status(500).json({ error: "Failed to fetch drafts" });
    }
  });

  // Get a single draft
  app.get("/api/drafts/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const draft = await storage.getDraft(id);
      
      if (!draft) {
        return res.status(404).json({ error: "Draft not found" });
      }
      
      if (draft.founderId !== userId) {
        return res.status(403).json({ error: "Not authorized to access this draft" });
      }
      
      res.json(draft);
    } catch (error) {
      console.error("Error fetching draft:", error);
      res.status(500).json({ error: "Failed to fetch draft" });
    }
  });

  // Create a new draft
  app.post("/api/drafts", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const draft = await storage.createDraft({
        founderId: userId,
        formData: req.body.formData || {},
        pitchDeckPath: req.body.pitchDeckPath || null,
        uploadedFiles: req.body.uploadedFiles || null,
        teamMembers: req.body.teamMembers || null,
        productScreenshots: req.body.productScreenshots || null,
      });
      res.status(201).json(draft);
    } catch (error) {
      console.error("Error creating draft:", error);
      res.status(500).json({ error: "Failed to create draft" });
    }
  });

  // Update a draft
  app.patch("/api/drafts/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const existingDraft = await storage.getDraft(id);
      
      if (!existingDraft) {
        return res.status(404).json({ error: "Draft not found" });
      }
      
      if (existingDraft.founderId !== userId) {
        return res.status(403).json({ error: "Not authorized to update this draft" });
      }
      
      const updated = await storage.updateDraft(id, {
        formData: req.body.formData,
        pitchDeckPath: req.body.pitchDeckPath,
        uploadedFiles: req.body.uploadedFiles,
        teamMembers: req.body.teamMembers,
        productScreenshots: req.body.productScreenshots,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating draft:", error);
      res.status(500).json({ error: "Failed to update draft" });
    }
  });

  // Delete a draft
  app.delete("/api/drafts/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const existingDraft = await storage.getDraft(id);
      
      if (!existingDraft) {
        return res.status(404).json({ error: "Draft not found" });
      }
      
      if (existingDraft.founderId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this draft" });
      }
      
      await storage.deleteDraft(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting draft:", error);
      res.status(500).json({ error: "Failed to delete draft" });
    }
  });

  // ================== UPLOAD ROUTES ==================

  const objectStorageService = new ObjectStorageService();
  
  app.post("/api/uploads/request-url", requireAuth, async (req, res) => {
    try {
      const { name, size, contentType } = req.body;
      
      if (!name || !contentType) {
        return res.status(400).json({ error: "Missing file metadata" });
      }
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // ================== PUBLIC SCORING WEIGHTS (for any authenticated user) ==================
  
  // Get all scoring weights - accessible by any authenticated user for display purposes
  app.get("/api/scoring-weights", requireAuth, async (req, res) => {
    try {
      const weights = await storage.getAllStageScoringWeights();
      res.json(weights);
    } catch (error) {
      console.error("Error fetching scoring weights:", error);
      res.status(500).json({ error: "Failed to fetch scoring weights" });
    }
  });

  // ================== INVESTOR ROUTES ==================

  // Get investor matches
  app.get("/api/investor/matches", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await storage.getInvestorProfile(userId);
      
      if (!profile) {
        return res.json([]);
      }
      
      const matches = await storage.getMatchesByInvestor(profile.id);
      
      // Enrich with startup data and section scores for custom weight calculation
      const enrichedMatches = await Promise.all(
        matches.map(async (match) => {
          const startup = await storage.getStartup(match.startupId);
          if (!startup) {
            return null;
          }
          
          // Get evaluation section scores for custom weight calculation
          const evaluation = await storage.getEvaluation(match.startupId);
          const sectionScores = evaluation?.sectionScores || null;
          
          return {
            ...match,
            ...startup,
            matchId: match.id,
            sectionScores,
          };
        })
      );
      
      res.json(enrichedMatches.filter(Boolean));
    } catch (error) {
      console.error("Error fetching matches:", error);
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });

  // Get investor stats
  app.get("/api/investor/stats", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await storage.getInvestorProfile(userId);
      
      if (!profile) {
        return res.json({
          totalMatches: 0,
          reviewing: 0,
          interested: 0,
          passed: 0,
        });
      }
      
      const matches = await storage.getMatchesByInvestor(profile.id);
      
      res.json({
        totalMatches: matches.length,
        reviewing: matches.filter(m => m.status === "reviewing").length,
        interested: matches.filter(m => m.status === "interested").length,
        passed: matches.filter(m => m.status === "passed").length,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Get investor thesis
  app.get("/api/investor/thesis", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await storage.getInvestorProfile(userId);
      
      if (!profile) {
        return res.json(null);
      }
      
      const thesis = await storage.getInvestmentThesis(profile.id);
      res.json(thesis);
    } catch (error) {
      console.error("Error fetching thesis:", error);
      res.status(500).json({ error: "Failed to fetch thesis" });
    }
  });

  // Save investor thesis
  app.post("/api/investor/thesis", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      let profile = await storage.getInvestorProfile(userId);
      
      // Create investor profile if it doesn't exist
      if (!profile) {
        profile = await storage.createInvestorProfile({
          userId,
          fundName: "My Fund",
        });
      }
      
      const thesis = await storage.createOrUpdateThesis(profile.id, req.body);
      
      // Trigger InvestorThesisAgent asynchronously to generate holistic thesis summary
      const investorId = profile.id;
      import("./investor-agents").then(({ runInvestorThesisAgent }) => {
        runInvestorThesisAgent(investorId).catch(err => {
          console.error("[InvestorThesisAgent] Error running thesis agent:", err);
        });
      });
      
      res.json(thesis);
    } catch (error) {
      console.error("Error saving thesis:", error);
      res.status(500).json({ error: "Failed to save thesis" });
    }
  });

  // Get investor's own private startups (submitted by them)
  app.get("/api/investor/my-startups", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const startups = await storage.getPrivateStartupsBySubmitter(userId);
      
      // Enrich with section scores for custom weight calculation
      const enrichedStartups = await Promise.all(
        startups.map(async (startup) => {
          const evaluation = await storage.getEvaluation(startup.id);
          return {
            ...startup,
            sectionScores: evaluation?.sectionScores || null,
          };
        })
      );
      
      res.json(enrichedStartups);
    } catch (error) {
      console.error("Error fetching investor startups:", error);
      res.status(500).json({ error: "Failed to fetch startups" });
    }
  });

  // Create startup submission by investor (auto-approved, private)
  app.post("/api/investor/startups", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      const parsed = insertStartupSchema.safeParse({
        ...req.body,
        founderId: userId,
        submittedByRole: "investor",
        isPrivate: true,
        status: "submitted", // Will be auto-approved after analysis completes
      });
      
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      
      const startup = await storage.createStartup(parsed.data);
      
      // Queue analysis (max 3 concurrent, rest wait in queue) - auto-approve for investor submissions
      queueAnalysis(startup.id, { autoApprove: true });
      
      res.status(201).json(startup);
    } catch (error) {
      console.error("Error creating investor startup:", error);
      res.status(500).json({ error: "Failed to create startup" });
    }
  });

  // Get startup for investor view
  app.get("/api/investor/startups/:id", requireAuth, requireInvestor, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);
      const startup = await storage.getStartup(id);
      
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      // Get investor profile to check for matches
      const profile = await storage.getInvestorProfile(userId);
      
      // Check if this startup was submitted through investor's portal (has a match)
      let hasInvestorMatch = false;
      if (profile) {
        const match = await storage.getMatchByInvestorAndStartup(profile.id, id);
        hasInvestorMatch = !!match;
      }
      
      // Allow viewing if:
      // 1. Startup is approved and not private (visible to all investors), OR
      // 2. Startup is private and was submitted by this investor, OR
      // 3. Startup was submitted through investor's portal (has a match)
      const isOwnPrivateStartup = startup.isPrivate && startup.founderId === userId;
      const isApprovedPublic = startup.status === "approved" && !startup.isPrivate;
      
      if (!isOwnPrivateStartup && !isApprovedPublic && !hasInvestorMatch) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      const evaluation = await storage.getEvaluation(id);
      
      // Fetch LinkedIn profile details for team members - match by name
      const linkedinProfiles: Record<string, any> = {};
      const teamMembers = (evaluation?.comprehensiveResearchData as any)?.extractedData?.teamMembers || [];
      const teamMemberEvals = (evaluation?.teamMemberEvaluations as any[]) || [];
      
      const memberNames = new Set<string>();
      for (const member of teamMembers) {
        if (member.name) memberNames.add(member.name.toLowerCase());
      }
      for (const member of teamMemberEvals) {
        if (member.name) memberNames.add(member.name.toLowerCase());
      }
      
      try {
        const allCachedProfiles = await storage.getAllCachedLinkedinProfiles();
        for (const cached of allCachedProfiles) {
          const profileData = cached.profileData as any;
          if (profileData?.name) {
            const profileNameLower = profileData.name.toLowerCase();
            if (memberNames.has(profileNameLower)) {
              linkedinProfiles[profileNameLower] = profileData;
            }
          }
        }
      } catch (err) {}
      
      // Get thesis alignment data from match (reuse profile from access check)
      let thesisAlignment = null;
      if (profile) {
        const matchForThesis = await storage.getMatchByInvestorAndStartup(profile.id, id);
        if (matchForThesis) {
          thesisAlignment = {
            score: matchForThesis.thesisFitScore,
            rationale: matchForThesis.fitRationale
          };
        }
      }
      
      res.json({ ...startup, evaluation, thesisAlignment, linkedinProfiles });
    } catch (error) {
      console.error("Error fetching startup:", error);
      res.status(500).json({ error: "Failed to fetch startup" });
    }
  });

  // ================== TEAM INVITE ROUTES (Investor) ==================

  // Get team invites and members for investor
  app.get("/api/investor/team", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await storage.getInvestorProfile(userId);
      
      if (!profile) {
        return res.json({ invites: [], members: [] });
      }
      
      const [invites, members] = await Promise.all([
        storage.getTeamInvitesByInvestorProfile(profile.id),
        storage.getTeamMembersByInvestorProfile(profile.id),
      ]);
      
      res.json({ invites, members });
    } catch (error) {
      console.error("Error fetching team:", error);
      res.status(500).json({ error: "Failed to fetch team" });
    }
  });

  // Create team invite
  app.post("/api/investor/team/invite", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      let profile = await storage.getInvestorProfile(userId);
      
      if (!profile) {
        profile = await storage.createInvestorProfile({
          userId,
          fundName: "My Fund",
        });
      }
      
      const { email, role = "member" } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const inviteCode = crypto.randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      const invite = await storage.createTeamInvite({
        investorProfileId: profile.id,
        invitedByUserId: userId,
        email,
        role,
        inviteCode,
        expiresAt,
        status: "pending",
      });
      
      res.json(invite);
    } catch (error) {
      console.error("Error creating invite:", error);
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  // Cancel team invite
  app.delete("/api/investor/team/invite/:id", requireAuth, requireInvestor, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.updateTeamInviteStatus(id, "cancelled");
      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling invite:", error);
      res.status(500).json({ error: "Failed to cancel invite" });
    }
  });

  // Remove team member
  app.delete("/api/investor/team/member/:id", requireAuth, requireInvestor, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.removeTeamMember(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  // ================== INVESTOR SCORING PREFERENCES ==================

  // Get all default scoring weights (for all stages)
  app.get("/api/investor/scoring-weights", requireAuth, requireInvestor, async (req, res) => {
    try {
      const weights = await storage.getAllStageScoringWeights();
      res.json(weights);
    } catch (error) {
      console.error("Error fetching scoring weights:", error);
      res.status(500).json({ error: "Failed to fetch scoring weights" });
    }
  });

  // Get scoring weights for a specific stage
  app.get("/api/investor/scoring-weights/:stage", requireAuth, requireInvestor, async (req, res) => {
    try {
      const { stage } = req.params;
      const weights = await storage.getStageScoringWeights(stage);
      if (!weights) {
        return res.status(404).json({ error: "Weights not found for this stage" });
      }
      res.json(weights);
    } catch (error) {
      console.error("Error fetching scoring weights:", error);
      res.status(500).json({ error: "Failed to fetch scoring weights" });
    }
  });

  // Get investor's custom scoring preferences
  app.get("/api/investor/scoring-preferences", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await storage.getInvestorProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "Investor profile not found" });
      }
      const preferences = await storage.getInvestorScoringPreferences(profile.id);
      res.json(preferences);
    } catch (error) {
      console.error("Error fetching scoring preferences:", error);
      res.status(500).json({ error: "Failed to fetch scoring preferences" });
    }
  });

  // Save investor's custom scoring preference for a stage
  app.put("/api/investor/scoring-preferences/:stage", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { stage } = req.params;
      const { useCustomWeights, customWeights } = req.body;
      
      const profile = await storage.getInvestorProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "Investor profile not found" });
      }

      if (useCustomWeights && customWeights) {
        const total = Object.values(customWeights).reduce((sum: number, w) => sum + (w as number), 0);
        if (total !== 100) {
          return res.status(400).json({ error: `Weights must sum to 100% (currently ${total}%)` });
        }
      }

      const preference = await storage.upsertInvestorScoringPreference({
        investorId: profile.id,
        stage: stage as any,
        useCustomWeights: useCustomWeights ?? false,
        customWeights: useCustomWeights ? customWeights : null,
      });
      
      res.json(preference);
    } catch (error) {
      console.error("Error saving scoring preference:", error);
      res.status(500).json({ error: "Failed to save scoring preference" });
    }
  });

  // ================== INVESTOR PORTAL ROUTES ==================

  // Get portal settings for current investor
  app.get("/api/investor/portal", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await storage.getInvestorProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "Investor profile not found" });
      }

      const settings = await storage.getPortalSettingsByInvestorId(profile.id);
      res.json(settings || null);
    } catch (error) {
      console.error("Error fetching portal settings:", error);
      res.status(500).json({ error: "Failed to fetch portal settings" });
    }
  });

  // Schema for portal settings validation
  const portalSettingsSchema = z.object({
    slug: z.string()
      .min(3, "URL must be at least 3 characters")
      .max(50, "URL must be less than 50 characters")
      .regex(/^[a-z0-9-]+$/, "URL can only contain lowercase letters, numbers, and hyphens")
      .optional(),
    welcomeMessage: z.string().optional().transform(v => v || undefined),
    tagline: z.string().optional().transform(v => v || undefined),
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color").optional(),
    requiredFields: z.array(z.string()).optional(),
    isEnabled: z.boolean().optional(),
  });

  // Create or update portal settings
  app.post("/api/investor/portal", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await storage.getInvestorProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "Investor profile not found" });
      }

      // Validate with Zod schema
      const parseResult = portalSettingsSchema.safeParse(req.body);
      if (!parseResult.success) {
        const firstError = parseResult.error.errors[0];
        return res.status(400).json({ error: firstError.message || "Invalid portal settings" });
      }

      const { slug, welcomeMessage, tagline, accentColor, requiredFields, isEnabled } = parseResult.data;

      const existingSettings = await storage.getPortalSettingsByInvestorId(profile.id);

      if (existingSettings) {
        // Check slug availability if changing
        if (slug && slug !== existingSettings.slug) {
          const slugAvailable = await storage.isSlugAvailable(slug, profile.id);
          if (!slugAvailable) {
            return res.status(400).json({ error: "This URL is already taken. Please choose another." });
          }
        }

        const updated = await storage.updatePortalSettings(profile.id, {
          slug: slug || existingSettings.slug,
          welcomeMessage,
          tagline,
          accentColor,
          requiredFields,
          isEnabled,
        });
        res.json(updated);
      } else {
        // Creating new - slug is required
        if (!slug) {
          return res.status(400).json({ error: "Portal URL slug is required" });
        }

        const slugAvailable = await storage.isSlugAvailable(slug);
        if (!slugAvailable) {
          return res.status(400).json({ error: "This URL is already taken. Please choose another." });
        }

        const created = await storage.createPortalSettings({
          investorId: profile.id,
          slug,
          welcomeMessage,
          tagline,
          accentColor,
          requiredFields,
          isEnabled: isEnabled ?? false,
        });
        res.json(created);
      }
    } catch (error) {
      console.error("Error saving portal settings:", error);
      res.status(500).json({ error: "Failed to save portal settings" });
    }
  });

  // Check if slug is available
  app.get("/api/investor/portal/check-slug/:slug", requireAuth, requireInvestor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await storage.getInvestorProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "Investor profile not found" });
      }

      const { slug } = req.params;
      const available = await storage.isSlugAvailable(slug, profile.id);
      res.json({ available });
    } catch (error) {
      console.error("Error checking slug:", error);
      res.status(500).json({ error: "Failed to check slug availability" });
    }
  });

  // ================== PUBLIC PORTAL ROUTES ==================
  // These are public routes - no auth required

  // Get public portal info by slug (for startups viewing the apply page)
  app.get("/api/portal/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const settings = await storage.getPortalSettingsBySlug(slug);
      
      if (!settings) {
        return res.status(404).json({ error: "Portal not found" });
      }

      if (!settings.isEnabled) {
        return res.status(404).json({ error: "This portal is not currently accepting submissions" });
      }

      // Get investor profile for branding info
      const investorProfile = await storage.getInvestorProfileById(settings.investorId);
      if (!investorProfile) {
        return res.status(404).json({ error: "Investor not found" });
      }

      res.json({
        portal: settings,
        investor: {
          fundName: investorProfile.fundName,
          fundDescription: investorProfile.fundDescription,
          logoUrl: investorProfile.logoUrl,
          website: investorProfile.website,
        }
      });
    } catch (error) {
      console.error("Error fetching portal:", error);
      res.status(500).json({ error: "Failed to fetch portal" });
    }
  });

  // Schema for portal submission validation
  const portalSubmissionSchema = z.object({
    name: z.string().min(1, "Company name is required"),
    website: z.string().url().optional().or(z.literal("")),
    description: z.string().optional(),
    stage: z.string().optional(),
    sector: z.string().optional(),
    sectorIndustryGroup: z.string().optional(),
    sectorIndustry: z.string().optional(),
    location: z.string().optional(),
    contactEmail: z.string().email("Valid email is required"),
    contactName: z.string().min(1, "Contact name is required"),
    contactPhone: z.string().optional(),
    contactPhoneCountryCode: z.string().optional(),
    pitchDeckUrl: z.string().optional(),
    pitchDeckPath: z.string().optional(),
    roundSize: z.number().optional(),
    roundCurrency: z.string().optional(),
    valuation: z.number().optional(),
    valuationKnown: z.boolean().optional(),
    valuationType: z.enum(["pre_money", "post_money"]).optional(),
    raiseType: z.enum(["safe", "convertible_note", "equity", "safe_equity", "undecided"]).optional(),
    leadSecured: z.boolean().optional(),
    leadInvestorName: z.string().optional(),
    hasPreviousFunding: z.boolean().optional(),
    previousFundingAmount: z.number().optional(),
    previousFundingCurrency: z.string().optional(),
    previousInvestors: z.string().optional(),
    previousRoundType: z.string().optional(),
    technologyReadinessLevel: z.string().optional(),
    demoVideoUrl: z.string().url().optional().or(z.literal("")),
    productDescription: z.string().optional(),
    productScreenshots: z.array(z.string()).optional(),
    files: z.array(z.object({
      path: z.string(),
      name: z.string(),
      type: z.string(),
    })).optional(),
    teamMembers: z.array(z.object({
      name: z.string(),
      role: z.string(),
      linkedinUrl: z.string(),
    })).optional(),
    submittedByRole: z.string().optional(),
    isPrivate: z.boolean().optional(),
  });

  // Submit startup through portal (public route - can be used by logged-in or anonymous users)
  app.post("/api/portal/:slug/submit", async (req, res) => {
    try {
      const { slug } = req.params;
      const settings = await storage.getPortalSettingsBySlug(slug);
      
      if (!settings) {
        return res.status(404).json({ error: "Portal not found" });
      }

      if (!settings.isEnabled) {
        return res.status(400).json({ error: "This portal is not currently accepting submissions" });
      }

      // Validate with Zod schema
      const parseResult = portalSubmissionSchema.safeParse(req.body);
      if (!parseResult.success) {
        const firstError = parseResult.error.errors[0];
        return res.status(400).json({ error: firstError.message || "Invalid submission data" });
      }

      const data = parseResult.data;

      // Validate portal-specific required fields
      const requiredFields = settings.requiredFields || [];

      if (requiredFields.includes("website") && !data.website) {
        return res.status(400).json({ error: "Website is required" });
      }

      if (requiredFields.includes("pitchDeck") && !data.pitchDeckUrl && !data.pitchDeckPath) {
        return res.status(400).json({ error: "Pitch deck is required" });
      }

      // Build sector from industry group and industry if provided
      const sector = data.sector || (data.sectorIndustryGroup && data.sectorIndustry 
        ? `${data.sectorIndustryGroup}:${data.sectorIndustry}` 
        : data.sectorIndustryGroup);

      // Create unique founder ID: use authenticated user ID or generate unique portal ID
      // Using UUID-based ID to avoid collisions for anonymous submissions
      const founderId = req.user 
        ? getUserId(req) 
        : `portal:${crypto.randomUUID()}`;
      
      const startup = await storage.createStartup({
        founderId,
        submittedByRole: "founder",
        name: data.name,
        website: data.website || undefined,
        description: data.description,
        stage: data.stage as any,
        sector,
        sectorIndustryGroup: data.sectorIndustryGroup,
        sectorIndustry: data.sectorIndustry,
        location: data.location,
        contactEmail: data.contactEmail,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactPhoneCountryCode: data.contactPhoneCountryCode,
        pitchDeckUrl: data.pitchDeckUrl,
        pitchDeckPath: data.pitchDeckPath,
        files: data.files,
        teamMembers: data.teamMembers,
        roundSize: data.roundSize,
        roundCurrency: data.roundCurrency,
        valuation: data.valuation,
        valuationKnown: data.valuationKnown,
        valuationType: data.valuationType as any,
        raiseType: data.raiseType as any,
        leadSecured: data.leadSecured,
        leadInvestorName: data.leadInvestorName,
        hasPreviousFunding: data.hasPreviousFunding,
        previousFundingAmount: data.previousFundingAmount,
        previousFundingCurrency: data.previousFundingCurrency,
        previousInvestors: data.previousInvestors,
        previousRoundType: data.previousRoundType,
        productDescription: data.productDescription,
        technologyReadinessLevel: data.technologyReadinessLevel as any,
        productScreenshots: data.productScreenshots,
        demoVideoUrl: data.demoVideoUrl || undefined,
        status: "submitted",
      });

      // Create a match to link this startup to the investor
      const investorProfile = await storage.getInvestorProfileById(settings.investorId);
      if (investorProfile) {
        await storage.createMatch({
          investorId: investorProfile.id,
          startupId: startup.id,
          status: "new",
        });
      }

      // Queue the startup for AI analysis
      queueAnalysis(startup.id);

      res.json({ success: true, startupId: startup.id });
    } catch (error) {
      console.error("Error submitting startup:", error);
      res.status(500).json({ error: "Failed to submit startup" });
    }
  });

  // ================== ADMIN ROUTES ==================

  // ================== ADMIN SCORING WEIGHTS ==================

  // Get all scoring weights (for all stages)
  app.get("/api/admin/scoring-weights", requireAuth, requireAdmin, async (req, res) => {
    try {
      const weights = await storage.getAllStageScoringWeights();
      res.json(weights);
    } catch (error) {
      console.error("Error fetching scoring weights:", error);
      res.status(500).json({ error: "Failed to fetch scoring weights" });
    }
  });

  // Get scoring weights for a specific stage
  app.get("/api/admin/scoring-weights/:stage", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { stage } = req.params;
      const weights = await storage.getStageScoringWeights(stage);
      if (!weights) {
        return res.status(404).json({ error: "Weights not found for this stage" });
      }
      res.json(weights);
    } catch (error) {
      console.error("Error fetching scoring weights:", error);
      res.status(500).json({ error: "Failed to fetch scoring weights" });
    }
  });

  // Update scoring weights for a stage
  app.put("/api/admin/scoring-weights/:stage", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { stage } = req.params;
      const { weights, rationale, overallRationale } = req.body;

      if (weights) {
        const total = Object.values(weights).reduce((sum: number, w) => sum + (w as number), 0);
        if (total !== 100) {
          return res.status(400).json({ error: `Weights must sum to 100% (currently ${total}%)` });
        }
      }

      const existing = await storage.getStageScoringWeights(stage);
      if (!existing) {
        const created = await storage.upsertStageScoringWeights({
          stage: stage as any,
          weights,
          rationale,
          overallRationale,
          lastModifiedBy: userId,
        });
        return res.json(created);
      }

      const updated = await storage.updateStageScoringWeights(stage, {
        weights,
        rationale,
        overallRationale,
        lastModifiedBy: userId,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating scoring weights:", error);
      res.status(500).json({ error: "Failed to update scoring weights" });
    }
  });

  // Seed default scoring weights
  app.post("/api/admin/scoring-weights/seed", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.seedStageScoringWeights();
      const weights = await storage.getAllStageScoringWeights();
      res.json({ success: true, count: weights.length, weights });
    } catch (error) {
      console.error("Error seeding scoring weights:", error);
      res.status(500).json({ error: "Failed to seed scoring weights" });
    }
  });

  // Get all startups for admin
  app.get("/api/admin/startups", requireAuth, requireAdmin, async (req, res) => {
    try {
      const startups = await storage.getAllStartups();
      res.json(startups);
    } catch (error) {
      console.error("Error fetching startups:", error);
      res.status(500).json({ error: "Failed to fetch startups" });
    }
  });

  // Get admin stats
  app.get("/api/admin/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const startups = await storage.getAllStartups();
      const investors = await storage.getAllInvestorProfiles();
      
      res.json({
        pendingReview: startups.filter(s => s.status === "pending_review" || s.status === "submitted").length,
        analyzing: startups.filter(s => s.status === "analyzing").length,
        approved: startups.filter(s => s.status === "approved").length,
        rejected: startups.filter(s => s.status === "rejected").length,
        totalInvestors: investors.length,
        totalMatches: 0, // TODO: implement
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Get admin analytics
  app.get("/api/admin/analytics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const startups = await storage.getAllStartups();
      const userProfiles = await storage.getAllUserProfiles();
      
      // Calculate recent submissions (last 7 days)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const recentSubmissions = startups.filter(s => new Date(s.createdAt) > oneWeekAgo).length;
      
      // Calculate average score
      const scoredStartups = startups.filter(s => s.overallScore !== null && s.overallScore !== undefined);
      const avgScore = scoredStartups.length > 0
        ? scoredStartups.reduce((sum, s) => sum + (s.overallScore || 0), 0) / scoredStartups.length
        : 0;
      
      res.json({
        totalStartups: startups.length,
        pendingReview: startups.filter(s => s.status === "pending_review" || s.status === "submitted").length,
        approved: startups.filter(s => s.status === "approved").length,
        rejected: startups.filter(s => s.status === "rejected").length,
        totalUsers: userProfiles.length,
        founders: userProfiles.filter(p => p.role === "founder").length,
        investors: userProfiles.filter(p => p.role === "investor").length,
        admins: userProfiles.filter(p => p.role === "admin").length,
        avgScore,
        recentSubmissions,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // Admin: List AgentMail webhooks
  app.get("/api/admin/webhooks/agentmail", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { listWebhooks } = await import("./integrations/agentmail");
      const webhooks = await listWebhooks();
      res.json({ webhooks: webhooks.data || [] });
    } catch (error) {
      console.error("Error listing webhooks:", error);
      res.status(500).json({ error: "Failed to list webhooks" });
    }
  });

  // Admin: Delete specific AgentMail webhook
  app.delete("/api/admin/webhooks/agentmail/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { deleteWebhook } = await import("./integrations/agentmail");
      await deleteWebhook(req.params.id);
      res.json({ success: true, message: "Webhook deleted" });
    } catch (error) {
      console.error("Error deleting webhook:", error);
      res.status(500).json({ error: "Failed to delete webhook" });
    }
  });

  // Get all users for admin
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userProfiles = await storage.getAllUserProfiles();
      
      // Get user details for each profile
      const profilesWithUsers = await Promise.all(
        userProfiles.map(async (profile) => {
          const user = await storage.getUser(profile.userId);
          return {
            ...profile,
            user: user ? {
              username: user.username,
              profileImageUrl: user.profileImageUrl,
            } : null,
          };
        })
      );
      
      res.json(profilesWithUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all agent conversations for admin
  app.get("/api/admin/conversations", requireAuth, requireAdmin, async (req, res) => {
    try {
      const conversations = await storage.getAllConversations();
      
      // Get message counts, last messages, and startup details for each conversation
      const conversationsWithDetails = await Promise.all(
        conversations.map(async (conv) => {
          const messages = await storage.getMessagesByConversation(conv.id);
          const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
          
          // Get startup details if linked
          let startup = null;
          if (conv.currentStartupId) {
            const s = await storage.getStartup(conv.currentStartupId);
            if (s) {
              startup = { id: s.id, companyName: s.companyName };
            }
          }
          
          return {
            ...conv,
            messageCount: messages.length,
            startup,
            lastMessage: lastMessage ? {
              content: lastMessage.content.slice(0, 200),
              direction: lastMessage.direction,
              channel: lastMessage.channel,
              createdAt: lastMessage.createdAt,
            } : null,
          };
        })
      );
      
      res.json(conversationsWithDetails);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Delete an agent conversation
  app.delete("/api/admin/conversations/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteConversation(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Get single startup for admin review
  app.get("/api/admin/startups/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const startup = await storage.getStartup(id);
      
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      const evaluation = await storage.getEvaluation(id);
      
      // Fetch LinkedIn profile details for team members - match by name
      const linkedinProfiles: Record<string, any> = {};
      const teamMembers = (evaluation?.comprehensiveResearchData as any)?.extractedData?.teamMembers || [];
      const teamMemberEvals = (evaluation?.teamMemberEvaluations as any[]) || [];
      
      // Get all team member names
      const memberNames = new Set<string>();
      for (const member of teamMembers) {
        if (member.name) memberNames.add(member.name.toLowerCase());
      }
      for (const member of teamMemberEvals) {
        if (member.name) memberNames.add(member.name.toLowerCase());
      }
      
      // Get all cached LinkedIn profiles and match by name
      try {
        const allCachedProfiles = await storage.getAllCachedLinkedinProfiles();
        for (const cached of allCachedProfiles) {
          const profileData = cached.profileData as any;
          if (profileData?.name) {
            const profileNameLower = profileData.name.toLowerCase();
            if (memberNames.has(profileNameLower)) {
              linkedinProfiles[profileNameLower] = profileData;
            }
          }
        }
      } catch (err) {
        console.error("Error fetching cached LinkedIn profiles:", err);
      }
      
      res.json({ ...startup, evaluation, linkedinProfiles });
    } catch (error) {
      console.error("Error fetching startup:", error);
      res.status(500).json({ error: "Failed to fetch startup" });
    }
  });

  // Re-analyze startup
  app.post("/api/admin/startups/:id/reanalyze", requireAuth, requireAdmin, async (req, res) => {
    console.log(`[reanalyze] POST /api/admin/startups/${req.params.id}/reanalyze called`);
    try {
      const id = parseInt(req.params.id);
      let fromStage = req.body?.fromStage ? parseInt(req.body.fromStage) : 4; // Default to Stage 4 (evaluation only)
      
      // Validate fromStage is between 1 and 4
      if (fromStage < 1 || fromStage > 4 || isNaN(fromStage)) {
        console.log(`[reanalyze] Invalid fromStage value: ${req.body?.fromStage}, defaulting to 4`);
        fromStage = 4;
      }
      
      const stageNames: Record<number, string> = {
        1: "Data Extraction",
        2: "LinkedIn Research",
        3: "Deep Research",
        4: "Evaluation Pipeline"
      };
      
      console.log(`[reanalyze] Starting re-analysis for startup ID: ${id} from Stage ${fromStage} (${stageNames[fromStage] || 'Unknown'})`);
      const startup = await storage.getStartup(id);
      
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      // Delete existing evaluation if it exists
      const existingEval = await storage.getEvaluation(id);
      if (existingEval) {
        // We'll update the startup status and let the analysis create a new evaluation
        console.log(`Re-analyzing startup ${id} from Stage ${fromStage}, existing evaluation will be replaced`);
      }
      
      // Queue analysis with fromStage option (max 3 concurrent, rest wait in queue)
      console.log(`[reanalyze] Queueing analysis for startup ${id} from Stage ${fromStage}...`);
      queueAnalysis(id, { fromStage });
      
      const queueStatus = analysisQueue.getStatus();
      console.log(`[reanalyze] Response sent for startup ${id}. Queue: ${queueStatus.queueLength}, Active: ${queueStatus.activeCount}/${queueStatus.maxConcurrent}`);
      res.json({ message: "Analysis queued", startupId: id, fromStage, queuePosition: analysisQueue.getPosition(id) });
    } catch (error) {
      console.error("Error re-analyzing startup:", error);
      res.status(500).json({ error: "Failed to start re-analysis" });
    }
  });

  // Get analysis queue status (admin only)
  app.get("/api/admin/analysis-queue/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = analysisQueue.getStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting queue status:", error);
      res.status(500).json({ error: "Failed to get queue status" });
    }
  });

  // Normalize locations for all startups (admin only)
  app.post("/api/admin/normalize-locations", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { normalizeLocationToRegion } = await import("./investor-agents");
      const allStartups = await storage.getAllStartups();
      const toNormalize = allStartups.filter(s => s.location && !s.normalizedRegion);
      
      console.log(`[Admin] Normalizing locations for ${toNormalize.length} startups`);
      res.json({ message: "Location normalization started", count: toNormalize.length });
      
      // Run normalization in background
      for (const startup of toNormalize) {
        try {
          const normalizedRegion = await normalizeLocationToRegion(startup.location!);
          if (normalizedRegion) {
            await storage.updateStartup(startup.id, { normalizedRegion });
            console.log(`[Admin] Normalized ${startup.name}: "${startup.location}" -> "${normalizedRegion}"`);
          }
        } catch (err) {
          console.error(`[Admin] Failed to normalize ${startup.name}:`, err);
        }
      }
      console.log(`[Admin] Location normalization complete`);
    } catch (error) {
      console.error("Error normalizing locations:", error);
      res.status(500).json({ error: "Failed to normalize locations" });
    }
  });

  // Trigger thesis alignment for a startup (admin only)
  app.post("/api/admin/startups/:id/run-alignment", requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    
    try {
      const startup = await storage.getStartup(id);
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      if (startup.status !== "approved") {
        return res.status(400).json({ error: "Startup must be approved to run alignment" });
      }
      
      const { runThesisAlignmentForApprovedStartup } = await import("./investor-agents");
      
      res.json({ message: "Thesis alignment started", startupId: id });
      
      runThesisAlignmentForApprovedStartup(id).then(() => {
        console.log(`[Admin] Thesis alignment completed for startup ${id}`);
      }).catch(err => {
        console.error(`[Admin] Thesis alignment failed for startup ${id}:`, err);
      });
    } catch (error) {
      console.error("Error triggering alignment:", error);
      res.status(500).json({ error: "Failed to trigger alignment" });
    }
  });

  // Re-analyze a specific section with admin feedback
  const validSections: SectionName[] = [
    "team", "market", "product", "traction", "businessModel", 
    "gtm", "financials", "competitiveAdvantage", "legal", "dealTerms", "exitPotential"
  ];

  app.post("/api/admin/startups/:id/reanalyze/:section", requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    const section = req.params.section as string;
    const { adminComment } = req.body;

    console.log(`[reanalyze-section] POST /api/admin/startups/${id}/reanalyze/${section}`);

    // Validate section name
    if (!validSections.includes(section as SectionName)) {
      return res.status(400).json({ 
        error: `Invalid section. Must be one of: ${validSections.join(", ")}` 
      });
    }

    try {
      const startup = await storage.getStartup(id);
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }

      // Start section re-analysis in background
      console.log(`[reanalyze-section] Starting ${section} re-analysis for startup ${id}...`);
      
      reanalyzeSection(id, section as SectionName, adminComment)
        .then(result => {
          if (result.success) {
            console.log(`[reanalyze-section] ${section} re-analysis complete for startup ${id}`);
          } else {
            console.error(`[reanalyze-section] ${section} re-analysis failed: ${result.error}`);
          }
        })
        .catch(err => {
          console.error(`[reanalyze-section] ${section} re-analysis failed for startup ${id}:`, err);
        });

      res.json({ 
        message: `Re-analysis of ${section} started`, 
        startupId: id,
        section 
      });
    } catch (error) {
      console.error(`Error re-analyzing ${section}:`, error);
      res.status(500).json({ error: `Failed to start ${section} re-analysis` });
    }
  });

  // Approve startup
  app.post("/api/admin/startups/:id/approve", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);
      const { adminNotes, scoreOverride } = req.body;
      
      const startup = await storage.getStartup(id);
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      // Create admin review
      await storage.createAdminReview({
        startupId: id,
        reviewerId: userId,
        decision: "approved",
        adminNotes,
        scoreOverride,
        reviewedAt: new Date(),
      });
      
      // Update startup status
      const updates: any = { status: "approved" };
      if (scoreOverride) {
        updates.overallScore = scoreOverride;
      }
      
      const updated = await storage.updateStartup(id, updates);
      
      // Trigger ThesisAlignmentAgent asynchronously for all matching investors
      const startupId = id;
      import("./investor-agents").then(({ runThesisAlignmentForApprovedStartup }) => {
        runThesisAlignmentForApprovedStartup(startupId).catch(err => {
          console.error("[ThesisAlignmentAgent] Error running alignment for approved startup:", err);
        });
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error approving startup:", error);
      res.status(500).json({ error: "Failed to approve startup" });
    }
  });

  // Reject startup
  app.post("/api/admin/startups/:id/reject", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);
      const { adminNotes } = req.body;
      
      const startup = await storage.getStartup(id);
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      // Create admin review
      await storage.createAdminReview({
        startupId: id,
        reviewerId: userId,
        decision: "rejected",
        adminNotes,
        reviewedAt: new Date(),
      });
      
      // Update startup status
      const updated = await storage.updateStartup(id, { status: "rejected" });
      
      res.json(updated);
    } catch (error) {
      console.error("Error rejecting startup:", error);
      res.status(500).json({ error: "Failed to reject startup" });
    }
  });

  // Admin update startup details
  app.patch("/api/admin/startups/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validate with partial insert schema
      const updateSchema = insertStartupSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error });
      }
      
      const startup = await storage.getStartup(id);
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      const updateData: Record<string, any> = {};
      const allowedFields = [
        'name', 'website', 'description', 'stage', 'sector', 'location', 'status',
        'sectorIndustryGroup', 'sectorIndustry', 'roundSize', 'roundCurrency',
        'valuation', 'valuationKnown', 'valuationType', 'raiseType', 'leadSecured', 'leadInvestorName',
        'contactName', 'contactEmail', 'contactPhone', 'contactPhoneCountryCode',
        'hasPreviousFunding', 'previousFundingAmount', 'previousFundingCurrency',
        'previousInvestors', 'previousRoundType', 'teamMembers', 'pitchDeckPath', 'files',
        'productDescription', 'technologyReadinessLevel', 'productScreenshots', 'demoVideoUrl'
      ];
      
      for (const field of allowedFields) {
        if (validationResult.data[field as keyof typeof validationResult.data] !== undefined) {
          updateData[field] = validationResult.data[field as keyof typeof validationResult.data];
        }
      }
      
      const updated = await storage.updateStartup(id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating startup:", error);
      res.status(500).json({ error: "Failed to update startup" });
    }
  });

  // Admin delete startup
  app.delete("/api/admin/startups/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const startup = await storage.getStartup(id);
      
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      await storage.deleteStartup(id);
      res.json({ success: true, message: "Startup deleted successfully" });
    } catch (error) {
      console.error("Error deleting startup:", error);
      res.status(500).json({ error: "Failed to delete startup" });
    }
  });

  // ================== AGENT PROMPTS (Admin) ==================
  
  // Get all agent prompts
  app.get("/api/admin/agents", requireAuth, requireAdmin, async (req, res) => {
    try {
      const prompts = await storage.getAllAgentPrompts();
      res.json(prompts);
    } catch (error) {
      console.error("Error fetching agent prompts:", error);
      res.status(500).json({ error: "Failed to fetch agent prompts" });
    }
  });

  // Get a single agent prompt by key
  app.get("/api/admin/agents/:agentKey", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { agentKey } = req.params;
      const prompt = await storage.getAgentPrompt(agentKey);
      
      if (!prompt) {
        return res.status(404).json({ error: "Agent not found" });
      }
      
      res.json(prompt);
    } catch (error) {
      console.error("Error fetching agent prompt:", error);
      res.status(500).json({ error: "Failed to fetch agent prompt" });
    }
  });

  // Update an agent prompt
  app.put("/api/admin/agents/:agentKey", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { agentKey } = req.params;
      const userId = getUserId(req);
      
      const existingPrompt = await storage.getAgentPrompt(agentKey);
      if (!existingPrompt) {
        return res.status(404).json({ error: "Agent not found" });
      }
      
      // Validate allowed fields for update
      const allowedFields = [
        'displayName', 'description', 'systemPrompt', 'humanPrompt',
        'tools', 'inputs', 'outputs', 'parentAgent', 'executionOrder', 'isParallel'
      ];
      
      const updates: Record<string, any> = {
        lastModifiedBy: userId,
      };
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          // Validate prompt fields are strings
          if ((field === 'systemPrompt' || field === 'humanPrompt') && typeof req.body[field] !== 'string') {
            return res.status(400).json({ error: `${field} must be a string` });
          }
          updates[field] = req.body[field];
        }
      }
      
      const updated = await storage.updateAgentPrompt(agentKey, updates);
      
      // Clear the prompt cache so changes take effect immediately
      const { clearPromptCacheFor } = await import("./agent-prompt-loader");
      clearPromptCacheFor(agentKey);
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating agent prompt:", error);
      res.status(500).json({ error: "Failed to update agent prompt" });
    }
  });

  // Seed agent prompts (useful for initialization)
  app.post("/api/admin/agents/seed", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.seedAgentPrompts();
      const prompts = await storage.getAllAgentPrompts();
      res.json({ success: true, count: prompts.length });
    } catch (error) {
      console.error("Error seeding agent prompts:", error);
      res.status(500).json({ error: "Failed to seed agent prompts" });
    }
  });

  // Sync prompts from dev to production (runs the sync-prompts-to-production logic)
  app.post("/api/admin/agents/sync-from-dev", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { syncPromptsToDatabase } = await import("./sync-prompts-inline");
      const result = await syncPromptsToDatabase();
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error syncing agent prompts:", error);
      res.status(500).json({ error: "Failed to sync agent prompts" });
    }
  });

  // Setup initial admin (one-time setup, requires authentication)
  app.post("/api/setup/make-admin", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      // Only allow specific trusted emails to become admin
      const trustedAdminEmails = ["karimnassereddine@gmail.com", "karim@insideline.ai"];
      
      if (!user || !trustedAdminEmails.includes(user.email || "")) {
        return res.status(403).json({ error: "Not authorized to become admin" });
      }
      
      // Check if profile exists
      let profile = await storage.getUserProfile(userId);
      
      if (profile) {
        // Update existing profile to admin
        profile = await storage.updateUserProfile(userId, { role: "admin" });
      } else {
        // Create new profile as admin
        profile = await storage.createUserProfile({
          userId,
          role: "admin",
          companyName: null,
          bio: null,
          linkedinUrl: null
        });
      }
      
      res.json({ success: true, message: `User ${user.email} is now an admin`, profile });
    } catch (error) {
      console.error("Error setting up admin:", error);
      res.status(500).json({ error: "Failed to set up admin" });
    }
  });

  // Import data from JSON (for copying dev data to production)
  app.post("/api/admin/import-data", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { users, startups, evaluations, theses, weights } = req.body;
      const results = {
        users: 0,
        startups: 0,
        evaluations: 0,
        theses: 0,
        weights: 0
      };

      // Import users
      if (users && Array.isArray(users)) {
        for (const user of users) {
          try {
            const existing = await storage.getUser(user.id);
            if (!existing) {
              await storage.createUser(user);
              results.users++;
            }
          } catch (e) {
            console.log(`Skipping user ${user.email}: already exists`);
          }
        }
      }

      // Import startups
      if (startups && Array.isArray(startups)) {
        for (const startup of startups) {
          try {
            const existing = await storage.getStartup(startup.id);
            if (!existing) {
              await storage.importStartup(startup);
              results.startups++;
            }
          } catch (e) {
            console.log(`Skipping startup ${startup.name}: already exists`);
          }
        }
      }

      // Import evaluations
      if (evaluations && Array.isArray(evaluations)) {
        for (const evaluation of evaluations) {
          try {
            await storage.importEvaluation(evaluation);
            results.evaluations++;
          } catch (e) {
            console.log(`Skipping evaluation ${evaluation.id}: ${e}`);
          }
        }
      }

      // Import investment theses
      if (theses && Array.isArray(theses)) {
        for (const thesis of theses) {
          try {
            await storage.importThesis(thesis);
            results.theses++;
          } catch (e) {
            console.log(`Skipping thesis ${thesis.id}: ${e}`);
          }
        }
      }

      // Import scoring weights
      if (weights && Array.isArray(weights)) {
        for (const weight of weights) {
          try {
            await storage.importScoringWeight(weight);
            results.weights++;
          } catch (e) {
            console.log(`Skipping weight ${weight.stage}: ${e}`);
          }
        }
      }

      res.json({ 
        success: true, 
        imported: results,
        message: `Imported ${results.users} users, ${results.startups} startups, ${results.evaluations} evaluations, ${results.theses} theses, ${results.weights} weights`
      });
    } catch (error) {
      console.error("Error importing data:", error);
      res.status(500).json({ error: "Failed to import data" });
    }
  });

  // ================== PDF EXPORT ==================
  
  // Generate and download investment memo PDF
  app.get("/api/startups/:id/memo.pdf", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);
      
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Get user profile to check role
      const profile = await storage.getUserProfile(userId);
      const userRole = profile?.role || "founder";
      
      // Get startup
      const startup = await storage.getStartup(id);
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      // Authorization rules: PDF export is for investors and admins only
      // - Investors: can download approved public startups OR their own private submissions
      // - Admins: can download any startup
      // - Founders: not allowed
      if (userRole === "founder") {
        return res.status(403).json({ error: "Forbidden - PDF export is only available for investors and admins" });
      } else if (userRole === "investor") {
        // Investor access: approved public startups OR own private submissions
        const isOwnPrivateStartup = startup.isPrivate && startup.founderId === userId;
        const isApprovedPublic = startup.status === "approved" && !startup.isPrivate;
        
        if (!isOwnPrivateStartup && !isApprovedPublic) {
          return res.status(403).json({ error: "Forbidden - startup is not available for viewing" });
        }
      }
      // Admins can download any startup
      
      // Get evaluation
      const evaluation = await storage.getEvaluation(id);
      if (!evaluation) {
        return res.status(404).json({ error: "Evaluation not found - analysis may still be in progress" });
      }
      
      // Get user info for watermark
      const user = await storage.getUser(userId);
      const userWatermark = user?.email || userId;
      
      // Generate PDF
      const pdfBuffer = await generateStartupMemoPDF(startup, evaluation, userWatermark);
      
      // Set response headers for PDF download
      const sanitizedName = startup.name.replace(/[^a-zA-Z0-9-_]/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizedName}_Investment_Memo.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // Generate and download analysis report PDF (Summary, Product, Team, Competitors)
  app.get("/api/startups/:id/report.pdf", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);
      
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Get user profile to check role
      const profile = await storage.getUserProfile(userId);
      const userRole = profile?.role || "founder";
      
      // Get startup
      const startup = await storage.getStartup(id);
      if (!startup) {
        return res.status(404).json({ error: "Startup not found" });
      }
      
      // Authorization rules: PDF export is for investors and admins only
      if (userRole === "founder") {
        return res.status(403).json({ error: "Forbidden - PDF export is only available for investors and admins" });
      } else if (userRole === "investor") {
        const isOwnPrivateStartup = startup.isPrivate && startup.founderId === userId;
        const isApprovedPublic = startup.status === "approved" && !startup.isPrivate;
        
        if (!isOwnPrivateStartup && !isApprovedPublic) {
          return res.status(403).json({ error: "Forbidden - startup is not available for viewing" });
        }
      }
      
      // Get evaluation
      const evaluation = await storage.getEvaluation(id);
      if (!evaluation) {
        return res.status(404).json({ error: "Evaluation not found - analysis may still be in progress" });
      }
      
      // Get user info for watermark
      const user = await storage.getUser(userId);
      const userWatermark = user?.email || userId;
      
      // Generate Report PDF
      const pdfBuffer = await generateStartupReportPDF(startup, evaluation, userWatermark);
      
      // Set response headers for PDF download
      const sanitizedName = startup.name.replace(/[^a-zA-Z0-9-_]/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizedName}_Analysis_Report.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating Report PDF:", error);
      res.status(500).json({ error: "Failed to generate Report PDF" });
    }
  });

  // Notification routes
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const notifications = await storage.getNotificationsByUser(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);
      const notification = await storage.markNotificationRead(id, userId);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // ==========================================
  // Communication Agent Webhook Endpoints
  // ==========================================

  // AgentMail webhook for incoming emails
  app.post("/api/webhooks/agentmail", async (req, res) => {
    try {
      console.log("[AgentMail] === WEBHOOK V3 (download_url first) ===");
      console.log("AgentMail webhook received:", JSON.stringify(req.body, null, 2));
      
      // AgentMail sends event_type at root, with message data nested in 'message' object
      const { event_type, message, body_included, event_id } = req.body;
      
      // Deduplicate webhook events - check if we've already processed this event
      if (event_id && processedWebhookEvents.has(event_id)) {
        console.log(`[AgentMail] Duplicate webhook event ${event_id}, skipping`);
        res.json({ success: true, message: "Duplicate event, already processed" });
        return;
      }
      
      if (event_type === "message.received" && message) {
        const { getFullMessage, downloadAttachment } = await import("./integrations/agentmail");
        
        // Extract basic fields from the webhook message object
        const { from_, from: fromField, thread_id, message_id, inbox_id, attachments: rawAttachments, preview } = message;
        let subject = message.subject;
        let text = message.text;
        let html = message.html;
        
        // If body is not included in webhook, fetch the full message
        if (!body_included || (!text && !html)) {
          try {
            console.log(`[AgentMail] Body not included, fetching full message for inbox: ${inbox_id}, message: ${message_id}`);
            const fullMessage = await getFullMessage(inbox_id, message_id);
            text = fullMessage.text;
            html = fullMessage.html;
            subject = subject || fullMessage.subject;
            console.log(`[AgentMail] Fetched full message - subject: ${subject}, text length: ${text?.length || 0}, html length: ${html?.length || 0}`);
          } catch (fetchError) {
            console.error(`[AgentMail] Failed to fetch full message:`, fetchError);
            // Fall back to preview
            text = preview || '';
          }
        }
        
        // Parse sender from "Name <email>" format (use from_ or from, they're the same)
        const senderField = from_ || fromField || "";
        let senderEmail = "";
        let senderName = "";
        if (senderField) {
          const emailMatch = senderField.match(/<([^>]+)>/);
          if (emailMatch) {
            senderEmail = emailMatch[1];
            senderName = senderField.replace(/<[^>]+>/, "").trim();
          } else {
            // Just an email address without name
            senderEmail = senderField.trim();
          }
        }
        
        // Use text, html, or preview for body content
        const body = text || html || preview || "";
        
        // Process attachments - download them and upload to object storage
        const attachments: Array<{
          filename: string;
          contentType: string;
          url?: string;
          attachmentId: string;
          size: number;
          path?: string;
        }> = [];
        
        // Track if we have a critical failure (PDF/deck couldn't be saved)
        let criticalAttachmentFailed = false;
        let attachmentErrorMessage = "";
        
        if (rawAttachments && rawAttachments.length > 0) {
          console.log(`[AgentMail] Found ${rawAttachments.length} attachments to download`);
          console.log(`[AgentMail] Attachment details:`, JSON.stringify(rawAttachments, null, 2));
          
          // Import object storage service for uploads
          const { ObjectStorageService } = await import("./replit_integrations/object_storage");
          const objectStorageService = new ObjectStorageService();
          
          // Identify which attachments are critical (PDFs/decks)
          const isPdfOrDeck = (att: any) => 
            att.content_type === 'application/pdf' || 
            att.filename?.toLowerCase().endsWith('.pdf') ||
            att.filename?.toLowerCase().includes('deck') ||
            att.filename?.toLowerCase().includes('pitch');
          
          for (const att of rawAttachments) {
            const attachmentId = att.attachment_id;
            const filename = att.filename || `attachment-${attachmentId}`;
            const contentType = att.content_type || 'application/octet-stream';
            const isCritical = isPdfOrDeck(att);
            
            console.log(`[AgentMail] Processing attachment: ${filename} (${contentType}), ID: ${attachmentId}, critical: ${isCritical}`);
            
            // Retry logic for critical attachments
            const maxRetries = isCritical ? 3 : 1;
            let lastError: any = null;
            let success = false;
            
            for (let attempt = 1; attempt <= maxRetries && !success; attempt++) {
              try {
                if (attempt > 1) {
                  console.log(`[AgentMail] Retry attempt ${attempt}/${maxRetries} for ${filename}...`);
                  await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
                }
                
                // Download the attachment from AgentMail
                console.log(`[AgentMail] ===== STEP 1: DOWNLOAD FROM AGENTMAIL =====`);
                console.log(`[AgentMail] inbox_id: ${inbox_id}`);
                console.log(`[AgentMail] message_id: ${message_id}`);
                console.log(`[AgentMail] attachment_id: ${attachmentId}`);
                console.log(`[AgentMail] Starting download for ${filename} (attempt ${attempt})...`);
                
                const downloaded = await downloadAttachment(inbox_id, message_id, attachmentId, filename, contentType);
                
                console.log(`[AgentMail] ===== STEP 2: VALIDATE DOWNLOADED CONTENT =====`);
                console.log(`[AgentMail] Download complete - buffer size: ${downloaded.content.length} bytes`);
                
                // Validate the download
                if (!downloaded.content || downloaded.content.length === 0) {
                  throw new Error(`Downloaded content is empty for ${filename}`);
                }
                
                // Check magic bytes to verify content type
                const magicBytes = downloaded.content.slice(0, 5).toString('utf8');
                const magicBytesHex = downloaded.content.slice(0, 10).toString('hex');
                console.log(`[AgentMail] Magic bytes (utf8): "${magicBytes}"`);
                console.log(`[AgentMail] Magic bytes (hex): ${magicBytesHex}`);
                
                if (contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
                  if (magicBytes === '%PDF-') {
                    console.log(`[AgentMail] VALID PDF - Magic bytes confirmed`);
                  } else {
                    console.error(`[AgentMail] WARNING: Expected PDF but magic bytes don't match!`);
                    console.error(`[AgentMail] Expected: "%PDF-", Got: "${magicBytes}"`);
                  }
                }
                
                // Upload to object storage
                console.log(`[AgentMail] ===== STEP 3: UPLOAD TO OBJECT STORAGE =====`);
                console.log(`[AgentMail] Uploading ${filename} (${downloaded.content.length} bytes) to object storage...`);
                const objectPath = await objectStorageService.uploadBuffer({
                  buffer: downloaded.content,
                  filename: filename,
                  contentType: contentType,
                });
                
                console.log(`[AgentMail] ===== STEP 4: OBJECT STORAGE COMPLETE =====`);
                console.log(`[AgentMail] File saved to path: ${objectPath}`);
                console.log(`[AgentMail] Size: ${downloaded.content.length} bytes`);
                
                attachments.push({
                  filename: filename,
                  contentType: contentType,
                  attachmentId: attachmentId,
                  size: downloaded.content.length,
                  path: objectPath,
                });
                
                console.log(`[AgentMail] Successfully processed attachment: ${filename}`);
                success = true;
              } catch (dlError: any) {
                lastError = dlError;
                console.error(`[AgentMail] Attempt ${attempt} failed for ${filename}:`);
                console.error(`[AgentMail] Error: ${dlError?.message}`);
              }
            }
            
            if (!success) {
              console.error(`[AgentMail] All attempts failed for ${filename}:`);
              console.error(`[AgentMail] Final error: ${lastError?.message}`);
              console.error(`[AgentMail] Error stack:`, lastError?.stack);
              
              if (isCritical) {
                criticalAttachmentFailed = true;
                attachmentErrorMessage = `Failed to save the pitch deck "${filename}" after ${maxRetries} attempts. Error: ${lastError?.message}`;
              }
              
              // Include attachment info without path for tracking
              attachments.push({
                filename: att.filename,
                contentType: att.content_type,
                attachmentId: att.attachment_id,
                size: att.size,
              });
            }
          }
          
          const savedCount = attachments.filter(a => a.path).length;
          console.log(`[AgentMail] Finished processing attachments. Saved: ${savedCount}/${rawAttachments.length}`);
          
          if (criticalAttachmentFailed) {
            console.error(`[AgentMail] CRITICAL: PDF/deck attachment failed to save - analysis will not proceed`);
          }
        } else {
          console.log(`[AgentMail] No attachments found in this email`);
        }

        console.log(`[AgentMail] Processing email from ${senderEmail} (${senderName}), subject: ${subject}, attachments: ${attachments.length}`);

        // If critical attachment failed, send error response and don't create startup
        if (criticalAttachmentFailed) {
          console.error(`[AgentMail] Sending error response due to failed attachment upload`);
          
          // Get or create conversation for error response
          const conversation = await communicationAgent.getOrCreateConversation({
            channel: "email",
            senderEmail,
            senderName,
            emailThreadId: thread_id,
          });
          
          // Create error message
          const errorResponse = `I apologize, but I encountered a technical issue while processing the attached pitch deck. The file could not be saved for analysis.\n\nError details: ${attachmentErrorMessage}\n\nPlease try sending the email again with the pitch deck attached. If the issue persists, you can try:\n1. Sending the deck as a different file format\n2. Using a file sharing link (Google Drive, Dropbox)\n3. Contacting our support team\n\nWe apologize for any inconvenience.`;
          
          // Store messages
          await storage.createMessage({
            conversationId: conversation.id,
            channel: "email",
            direction: "inbound",
            content: `Subject: ${subject || "(no subject)"}\n\n${body}`,
            intent: "submission",
            externalMessageId: message_id,
            attachments: attachments as any,
          });
          
          const outboundMessage = await storage.createMessage({
            conversationId: conversation.id,
            channel: "email",
            direction: "outbound",
            content: errorResponse,
          });
          
          // Send error reply
          await communicationAgent.sendReply({
            conversation,
            message: outboundMessage,
            inboxId: inbox_id,
          });
          
          if (event_id) {
            processedWebhookEvents.set(event_id, Date.now());
          }
          
          res.json({ success: true, error: "Attachment processing failed", conversationId: conversation.id });
          return;
        }

        // Process the message (passing inboxId for reply purposes)
        const result = await communicationAgent.processInboundMessage({
          channel: "email",
          content: `Subject: ${subject || "(no subject)"}\n\n${body}`,
          senderEmail,
          senderName,
          emailThreadId: thread_id,
          externalMessageId: message_id,
          attachments,
          inboxId: inbox_id,
        });

        // Send the AI response with any attachments (e.g., PDF reports)
        await communicationAgent.sendReply({
          conversation: result.conversation,
          message: result.message,
          inboxId: inbox_id,
          attachments: result.attachments,
        });

        // Mark this event as processed only after successful handling
        if (event_id) {
          processedWebhookEvents.set(event_id, Date.now());
        }

        res.json({ success: true, conversationId: result.conversation.id });
      } else {
        console.log(`AgentMail event type not handled: ${event_type}`);
        // Still mark non-message events as processed to avoid retries
        if (event_id) {
          processedWebhookEvents.set(event_id, Date.now());
        }
        res.json({ success: true, message: "Event not processed" });
      }
    } catch (error) {
      console.error("AgentMail webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Twilio webhook for incoming WhatsApp messages
  app.post("/api/webhooks/twilio/whatsapp", async (req, res) => {
    try {
      console.log("Twilio WhatsApp webhook received:", JSON.stringify(req.body, null, 2));
      
      // Validate Twilio signature in production
      if (process.env.NODE_ENV === 'production') {
        const signature = req.headers['x-twilio-signature'] as string;
        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const isValid = await validateTwilioWebhook(signature, url, req.body);
        if (!isValid) {
          console.error("Invalid Twilio webhook signature");
          res.status(403).send("Forbidden");
          return;
        }
      }
      
      const {
        From,
        To,
        Body,
        MessageSid,
        ProfileName,
        NumMedia,
        MediaUrl0,
        MediaContentType0,
      } = req.body;

      // Extract phone number (remove whatsapp: prefix)
      const senderPhone = From?.replace("whatsapp:", "");
      
      // Collect media attachments
      const attachments: Array<{ filename: string; contentType: string; url?: string }> = [];
      const numMedia = parseInt(NumMedia || "0", 10);
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = req.body[`MediaUrl${i}`];
        const mediaType = req.body[`MediaContentType${i}`];
        if (mediaUrl) {
          attachments.push({
            filename: `attachment_${i}`,
            contentType: mediaType || "application/octet-stream",
            url: mediaUrl,
          });
        }
      }

      // Process the message
      const result = await communicationAgent.processInboundMessage({
        channel: "whatsapp",
        content: Body || "",
        senderPhone,
        senderName: ProfileName,
        whatsappThreadId: senderPhone, // Use phone as thread ID for WhatsApp
        externalMessageId: MessageSid,
        attachments,
      });

      // Send the AI response
      await communicationAgent.sendReply({
        conversation: result.conversation,
        message: result.message,
      });

      // Return TwiML response (empty, since we handle reply separately)
      res.set("Content-Type", "text/xml");
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    } catch (error) {
      console.error("Twilio WhatsApp webhook error:", error);
      res.set("Content-Type", "text/xml");
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    }
  });

  // Get all agent conversations (admin only)
  app.get("/api/agent/conversations", requireAuth, async (req, res) => {
    try {
      await requireAdmin(req, res, async () => {
        const conversations = await storage.getAllConversations();
        res.json(conversations);
      });
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get messages for a conversation (admin only)
  app.get("/api/agent/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      await requireAdmin(req, res, async () => {
        const conversationId = parseInt(req.params.id, 10);
        const messages = await storage.getMessagesByConversation(conversationId);
        res.json(messages);
      });
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Get or create agent inbox configuration
  app.get("/api/agent/inbox", requireAuth, async (req, res) => {
    try {
      await requireAdmin(req, res, async () => {
        const inbox = await storage.getActiveInbox();
        res.json(inbox || { message: "No inbox configured" });
      });
    } catch (error) {
      console.error("Error fetching inbox:", error);
      res.status(500).json({ error: "Failed to fetch inbox" });
    }
  });

  // Configure webhook URL for AgentMail
  app.post("/api/agent/configure-webhook", requireAuth, async (req, res) => {
    try {
      await requireAdmin(req, res, async () => {
        const { configureWebhook } = await import("./integrations/agentmail");
        
        // Use production domain if available, otherwise fall back to request host
        let webhookUrl: string;
        const replitDomains = process.env.REPLIT_DOMAINS;
        
        if (replitDomains) {
          const primaryDomain = replitDomains.split(',')[0];
          webhookUrl = `https://${primaryDomain}/api/webhooks/agentmail`;
        } else {
          const protocol = req.protocol;
          const host = req.get('host');
          webhookUrl = `${protocol}://${host}/api/webhooks/agentmail`;
        }
        
        console.log(`Configuring AgentMail webhook URL: ${webhookUrl}`);
        
        const result = await configureWebhook(webhookUrl);
        res.json({ 
          message: "Webhook configuration complete",
          webhookUrl,
          result 
        });
      });
    } catch (error) {
      console.error("Error configuring webhook:", error);
      res.status(500).json({ error: "Failed to configure webhook" });
    }
  });

  // Create or update agent inbox configuration
  app.post("/api/agent/inbox", requireAuth, async (req, res) => {
    try {
      await requireAdmin(req, res, async () => {
        const { agentMailInboxId, emailAddress, twilioPhoneNumber, welcomeMessage } = req.body;
        
        const existingInbox = await storage.getActiveInbox();
        
        if (existingInbox) {
          const updated = await storage.updateInbox(existingInbox.id, {
            agentMailInboxId,
            emailAddress,
            twilioPhoneNumber,
            welcomeMessage,
          });
          res.json(updated);
        } else {
          const created = await storage.createInbox({
            agentMailInboxId,
            emailAddress,
            twilioPhoneNumber,
            welcomeMessage,
            isActive: true,
            autoReplyEnabled: true,
          });
          res.json(created);
        }
      });
    } catch (error) {
      console.error("Error saving inbox:", error);
      res.status(500).json({ error: "Failed to save inbox" });
    }
  });

  return httpServer;
}
