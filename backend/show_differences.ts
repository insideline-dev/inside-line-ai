import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiPromptDefinition, aiPromptRevision } from "./src/database/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

import { AI_PROMPT_CATALOG } from "./src/modules/ai/services/ai-prompt-catalog";

async function showDifferences() {
  // Just check research.team as an example
  const definitions = await db.select().from(aiPromptDefinition)
    .then(defs => defs.filter(d => d.key === "research.team"));
  
  for (const def of definitions) {
    const published = await db
      .select()
      .from(aiPromptRevision)
      .where(eq(aiPromptRevision.definitionId, def.id))
      .then(revs => revs.filter(r => r.status === "published")[0]);
    
    const catalog = AI_PROMPT_CATALOG[def.key as any];
    
    console.log(`\n=== ${def.key.toUpperCase()} SYSTEM PROMPT ===\n`);
    
    console.log("--- DATABASE VERSION (CURRENTLY USED) ---");
    console.log(published!.systemPrompt.slice(0, 500) + "...\n");
    
    console.log("--- CODE VERSION ---");
    console.log(catalog.defaultSystemPrompt.slice(0, 500) + "...\n");
    
    console.log("DB Length:", published!.systemPrompt.length);
    console.log("Code Length:", catalog.defaultSystemPrompt.length);
  }
  
  process.exit(0);
}

showDifferences().catch(e => {
  console.error(e);
  process.exit(1);
});
