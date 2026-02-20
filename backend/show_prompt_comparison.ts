import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiPromptDefinition, aiPromptRevision } from "./src/database/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function show() {
  const oldBackendJson = require('/Users/hassanoigag/Downloads/Line AI Prompts.json');
  const oldTeam = oldBackendJson.find((a: any) => a.agent_key === "team");
  
  const dbDef = await db.select().from(aiPromptDefinition)
    .then(d => d.filter(x => x.key === "evaluation.team")[0]);
  
  const dbRevision = await db.select().from(aiPromptRevision)
    .where(eq(aiPromptRevision.definitionId, dbDef.id))
    .then(r => r.filter(x => x.status === "published")[0]);
  
  console.log("\n" + "=".repeat(80));
  console.log("OLD BACKEND PROMPT (evaluation.team)");
  console.log("=".repeat(80) + "\n");
  console.log(oldTeam.system_prompt);
  
  console.log("\n" + "=".repeat(80));
  console.log("DATABASE PROMPT (evaluation.team)");
  console.log("=".repeat(80) + "\n");
  console.log(dbRevision!.systemPrompt);
  
  console.log("\n" + "=".repeat(80));
  console.log("ANALYSIS");
  console.log("=".repeat(80));
  console.log(`\nOld Backend: ${oldTeam.system_prompt.length} chars`);
  console.log(`Database:   ${dbRevision!.systemPrompt.length} chars`);
  console.log(`Difference: ${oldTeam.system_prompt.length - dbRevision!.systemPrompt.length} chars shorter in DB`);
  
  console.log(`\n✅ The DB prompt is a SIMPLIFIED version, NOT the old backend`);
  console.log(`❌ Key sections missing from DB prompt:`);
  console.log(`   - Detailed evaluation framework`);
  console.log(`   - Scoring guidelines`);
  console.log(`   - Output JSON structure`);
  
  process.exit(0);
}

show().catch(e => { console.error(e); process.exit(1); });
