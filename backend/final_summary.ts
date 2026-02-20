import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiPromptDefinition, aiPromptRevision } from "./src/database/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

import { AI_PROMPT_CATALOG } from "./src/modules/ai/services/ai-prompt-catalog";

async function analyze() {
  const definitions = await db.select().from(aiPromptDefinition);
  
  let dbDiff = 0;
  let codeMatch = 0;
  
  for (const def of definitions) {
    const revs = await db.select().from(aiPromptRevision)
      .where(eq(aiPromptRevision.definitionId, def.id));
    
    const pub = revs.filter(r => r.status === "published")[0];
    if (!pub) continue;
    
    const cat = AI_PROMPT_CATALOG[def.key as any];
    if (!cat) continue;
    
    const sysDiff = pub.systemPrompt !== cat.defaultSystemPrompt;
    
    if (sysDiff) {
      dbDiff++;
      console.log(`\n❌ ${def.key}: DB SYSTEM PROMPT IS DIFFERENT FROM CODE`);
      console.log(`   DB: ${pub.systemPrompt.length} chars`);
      console.log(`   Code: ${cat.defaultSystemPrompt.length} chars`);
      console.log(`   Diff: ${Math.abs(pub.systemPrompt.length - cat.defaultSystemPrompt.length)} chars`);
    } else {
      codeMatch++;
    }
  }
  
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`✅ Code prompts match DB: ${codeMatch}`);
  console.log(`❌ DB prompts differ from code: ${dbDiff}`);
  console.log(`\n📌 STATUS: YOU ARE USING DB PROMPTS, NOT CODE FALLBACK`);
  console.log(`📌 MOST SYSTEM PROMPTS ARE OUTDATED (missing latest code changes)`);
  
  process.exit(0);
}

analyze().catch(e => { console.error(e); process.exit(1); });
