import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiPromptDefinition, aiPromptRevision } from "./src/database/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

// Old backend prompt mapping
const OLD_AGENTS = {
  "team": { dbKey: "evaluation.team", name: "Team Analysis Agent" },
  "market": { dbKey: "evaluation.market", name: "Market Analysis Agent" },
  "product": { dbKey: "evaluation.product", name: "Product Analysis Agent" },
  "traction": { dbKey: "evaluation.traction", name: "Traction Analysis Agent" },
  "businessModel": { dbKey: "evaluation.businessModel", name: "Business Model Agent" },
  "gtm": { dbKey: "evaluation.gtm", name: "Go-To-Market Agent" },
  "financials": { dbKey: "evaluation.financials", name: "Financials Agent" },
  "competitiveAdvantage": { dbKey: "evaluation.competitiveAdvantage", name: "Competitive Advantage Agent" },
  "legal": { dbKey: "evaluation.legal", name: "Legal & Regulatory Agent" },
  "dealTerms": { dbKey: "evaluation.dealTerms", name: "Deal Terms Agent" },
  "exitPotential": { dbKey: "evaluation.exitPotential", name: "Exit Potential Agent" }
};

async function compare() {
  console.log("\n=== COMPARING OLD BACKEND PROMPTS vs DATABASE ===\n");
  
  const oldBackendJson = require('/Users/hassanoigag/Downloads/Line AI Prompts.json');
  
  // Find old team agent
  const oldTeamAgent = oldBackendJson.find((a: any) => a.agent_key === "team");
  if (!oldTeamAgent) {
    console.log("❌ Could not find old team agent in JSON");
    process.exit(0);
  }
  
  // Get DB version
  const dbDef = await db.select().from(aiPromptDefinition)
    .then(d => d.filter(x => x.key === "evaluation.team")[0]);
  
  if (!dbDef) {
    console.log("❌ Could not find evaluation.team in database");
    process.exit(0);
  }
  
  const dbRevision = await db.select().from(aiPromptRevision)
    .where(eq(aiPromptRevision.definitionId, dbDef.id))
    .then(r => r.filter(x => x.status === "published")[0]);
  
  if (!dbRevision) {
    console.log("❌ No published revision found");
    process.exit(0);
  }
  
  console.log("=== OLD BACKEND (Team Agent) ===");
  console.log(`System Prompt Length: ${oldTeamAgent.system_prompt.length} chars`);
  console.log(`Human Prompt Length: ${oldTeamAgent.human_prompt.length} chars`);
  console.log(`First 300 chars: ${oldTeamAgent.system_prompt.slice(0, 300)}...\n`);
  
  console.log("=== DATABASE (evaluation.team) ===");
  console.log(`System Prompt Length: ${dbRevision.systemPrompt.length} chars`);
  console.log(`Human Prompt Length: ${dbRevision.userPrompt.length} chars`);
  console.log(`First 300 chars: ${dbRevision.systemPrompt.slice(0, 300)}...\n`);
  
  const oldHash = require('crypto').createHash('sha256').update(oldTeamAgent.system_prompt).digest('hex').slice(0, 8);
  const dbHash = require('crypto').createHash('sha256').update(dbRevision.systemPrompt).digest('hex').slice(0, 8);
  
  if (oldHash === dbHash) {
    console.log("✅ DATABASE CONTAINS THE OLD BACKEND PROMPT");
  } else {
    console.log("❌ DATABASE CONTAINS A DIFFERENT PROMPT");
    console.log(`   Old Hash: ${oldHash}`);
    console.log(`   DB Hash:  ${dbHash}`);
  }
  
  process.exit(0);
}

compare().catch(e => {
  console.error(e);
  process.exit(1);
});
