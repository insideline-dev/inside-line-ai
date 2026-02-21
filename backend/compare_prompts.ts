import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiPromptDefinition, aiPromptRevision } from "./src/database/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

// Import code prompts
import { 
  TEAM_RESEARCH_SYSTEM_PROMPT, TEAM_RESEARCH_HUMAN_PROMPT,
  MARKET_RESEARCH_SYSTEM_PROMPT, MARKET_RESEARCH_HUMAN_PROMPT,
  PRODUCT_RESEARCH_SYSTEM_PROMPT, PRODUCT_RESEARCH_HUMAN_PROMPT,
  COMPETITOR_RESEARCH_SYSTEM_PROMPT, COMPETITOR_RESEARCH_HUMAN_PROMPT,
  NEWS_RESEARCH_SYSTEM_PROMPT, NEWS_RESEARCH_HUMAN_PROMPT,
} from "./src/modules/ai/prompts/research/index";
import { AI_PROMPT_CATALOG } from "./src/modules/ai/services/ai-prompt-catalog";

const hash = (str: string) => createHash("sha256").update(str).digest("hex").slice(0, 8);

async function comparePrompts() {
  const definitions = await db.select().from(aiPromptDefinition);
  
  console.log("\n=== COMPARING DB PROMPTS vs CODE PROMPTS ===\n");
  
  for (const def of definitions) {
    const published = await db
      .select()
      .from(aiPromptRevision)
      .where(eq(aiPromptRevision.definitionId, def.id))
      .then(revs => revs.filter(r => r.status === "published")[0]);
    
    if (!published) continue;
    
    const catalog = AI_PROMPT_CATALOG[def.key as any];
    if (!catalog) continue;
    
    const dbSysHash = hash(published.systemPrompt);
    const dbUserHash = hash(published.userPrompt);
    const codeSysHash = hash(catalog.defaultSystemPrompt);
    const codeUserHash = hash(catalog.defaultUserPrompt);
    
    const sysMatch = dbSysHash === codeSysHash;
    const userMatch = dbUserHash === codeUserHash;
    
    console.log(`${def.key}:`);
    console.log(`  System: ${sysMatch ? "✅ SAME" : "❌ DIFFERENT"} (DB: ${dbSysHash}, Code: ${codeSysHash})`);
    console.log(`  User:   ${userMatch ? "✅ SAME" : "❌ DIFFERENT"} (DB: ${dbUserHash}, Code: ${codeUserHash})`);
    
    if (!sysMatch || !userMatch) {
      console.log(`  ⚠️  DB PROMPT IS DIFFERENT FROM CODE!`);
    }
    console.log("");
  }
  
  process.exit(0);
}

comparePrompts().catch(e => {
  console.error(e);
  process.exit(1);
});
