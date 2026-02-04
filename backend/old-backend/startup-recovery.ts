import { db } from "./db";
import { startups, startupEvaluations } from "../shared/schema";
import { eq, and, isNotNull, or } from "drizzle-orm";
import { queueAnalysis } from "./analysis-queue";

export async function recoverOrphanedStartups(): Promise<void> {
  console.log("[Recovery] Checking for orphaned startups...");

  try {
    const orphanedStartups = await db
      .select({
        id: startups.id,
        name: startups.name,
        status: startups.status,
        pitchDeckPath: startups.pitchDeckPath,
        createdAt: startups.createdAt,
      })
      .from(startups)
      .where(
        and(
          or(
            eq(startups.status, "submitted"),
            eq(startups.status, "analyzing")
          ),
          isNotNull(startups.pitchDeckPath)
        )
      );

    if (orphanedStartups.length === 0) {
      console.log("[Recovery] No orphaned startups found");
      return;
    }

    console.log(`[Recovery] Found ${orphanedStartups.length} potentially orphaned startups`);

    for (const startup of orphanedStartups) {
      const createdAt = new Date(startup.createdAt);
      const now = new Date();
      const ageMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

      if (ageMinutes < 5) {
        console.log(`[Recovery] Startup ${startup.id} (${startup.name}) is too recent (${ageMinutes.toFixed(1)} min), skipping`);
        continue;
      }

      const existingEval = await db
        .select({ id: startupEvaluations.id, status: startupEvaluations.status })
        .from(startupEvaluations)
        .where(eq(startupEvaluations.startupId, startup.id))
        .limit(1);

      if (existingEval.length > 0 && existingEval[0].status === "completed") {
        console.log(`[Recovery] Startup ${startup.id} (${startup.name}) already has completed evaluation, skipping`);
        continue;
      }

      console.log(`[Recovery] Re-queueing startup ${startup.id} (${startup.name}) - status: ${startup.status}, age: ${ageMinutes.toFixed(1)} min`);

      await db
        .update(startups)
        .set({ status: "submitted" })
        .where(eq(startups.id, startup.id));

      queueAnalysis(startup.id);
    }

    console.log("[Recovery] Orphaned startup recovery complete");
  } catch (error) {
    console.error("[Recovery] Error during orphan recovery:", error);
    throw error;
  }
}
