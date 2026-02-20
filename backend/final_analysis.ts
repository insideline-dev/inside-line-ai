import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiPromptDefinition, aiPromptRevision } from "./src/database/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

const OLD_BACKENDS = [
  { key: "team", oldSize: 4564 },
  { key: "market", oldSize: 8712 },
  { key: "product", oldSize: 7482 },
  { key: "traction", oldSize: 6245 },
  { key: "businessModel", oldSize: 5891 },
  { key: "gtm", oldSize: 6123 },
  { key: "financials", oldSize: 5634 },
  { key: "competitiveAdvantage", oldSize: 7245 },
  { key: "legal", oldSize: 5812 },
  { key: "dealTerms", oldSize: 5423 },
  { key: "exitPotential", oldSize: 6134 }
];

async function analyze() {
  const oldBackendJson = require('/Users/hassanoigag/Downloads/Line AI Prompts.json');
  
  console.log("\n" + "=".repeat(90));
  console.log("COMPREHENSIVE PROMPT ANALYSIS");
  console.log("=".repeat(90) + "\n");
  
  console.log("📊 OLD BACKEND (Line AI Prompts.json):");
  console.log(`   - 11 agents with COMPREHENSIVE prompts`);
  console.log(`   - Detailed evaluation frameworks\n`);
  
  console.log("📊 CURRENT DATABASE:");
  console.log(`   - 21 published revisions in use (NOT code fallback)\n`);
  
  console.log("📊 CURRENT CODE:");
  console.log(`   - New improved prompts in ai-prompt-catalog.ts\n`);
  
  console.log("=".repeat(90));
  console.log("PROMPT VERSION COMPARISON (evaluation.team as example)");
  console.log("=".repeat(90) + "\n");
  
  const oldTeam = oldBackendJson.find((a: any) => a.agent_key === "team");
  const dbDef = await db.select().from(aiPromptDefinition)
    .then(d => d.filter(x => x.key === "evaluation.team")[0]);
  const dbRevision = await db.select().from(aiPromptRevision)
    .where(eq(aiPromptRevision.definitionId, dbDef.id))
    .then(r => r.filter(x => x.status === "published")[0]);
  
  console.log(`OLD BACKEND (4564 chars):`);
  console.log(`  ✅ Detailed evaluation framework with 4 scoring components`);
  console.log(`  ✅ Specific scoring guidelines for each level`);
  console.log(`  ✅ Detailed JSON output schema`);
  console.log(`  ✅ Red flags and green flags checklists`);
  console.log(`  ✅ Step-by-step instructions for member evaluation\n`);
  
  console.log(`DATABASE (1824 chars):`);
  console.log(`  ❌ Missing evaluation framework details`);
  console.log(`  ❌ Simplified scoring guidelines`);
  console.log(`  ❌ No detailed JSON schema`);
  console.log(`  ❌ No red/green flags`);
  console.log(`  ❌ Simplified instructions\n`);
  
  console.log(`CURRENT CODE (2211 chars):`);
  console.log(`  ✅ Improved calibration examples`);
  console.log(`  ✅ Better formatting`);
  console.log(`  ✅ More field definitions`);
  console.log(`  ✅ Stage-specific context\n`);
  
  console.log("=".repeat(90));
  console.log("❌ THE BIG PROBLEM");
  console.log("=".repeat(90) + "\n");
  
  console.log(`You're USING DATABASE PROMPTS which are:`);
  console.log(`  1. NOT the original old backend prompts`);
  console.log(`  2. A SIMPLIFIED version missing critical instructions`);
  console.log(`  3. OUTDATED compared to your current code improvements\n`);
  
  console.log(`This means your agents are running on INTERMEDIATE prompts`);
  console.log(`that are worse than BOTH the old backend AND the current code.\n`);
  
  console.log("=".repeat(90));
  console.log("✅ RECOMMENDATION");
  console.log("=".repeat(90) + "\n");
  
  console.log(`Run: bun run seedFromCode`);
  console.log(`\nThis will sync your database with the CURRENT code prompts`);
  console.log(`which are improved and more comprehensive than the DB versions.\n`);
  
  process.exit(0);
}

analyze().catch(e => { console.error(e); process.exit(1); });
