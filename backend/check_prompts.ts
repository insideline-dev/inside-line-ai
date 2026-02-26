import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiPromptDefinition, aiPromptRevision } from "./src/database/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function checkPrompts() {
  try {
    const definitions = await db.select().from(aiPromptDefinition);
    
    console.log(`\n=== PROMPT DEFINITIONS (${definitions.length} total) ===\n`);
    
    for (const def of definitions) {
      const revisions = await db
        .select()
        .from(aiPromptRevision)
        .where(eq(aiPromptRevision.definitionId, def.id));
      
      const published = revisions.filter(r => r.status === "published");
      
      if (published.length === 0) {
        console.log(`${def.key}: ❌ NO PUBLISHED (using code fallback)`);
      } else {
        console.log(`${def.key}: ✅ HAS PUBLISHED REVISIONS (${published.length})`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkPrompts();
