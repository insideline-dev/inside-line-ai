import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiPromptDefinition, aiPromptRevision } from "./src/database/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function dump() {
  const defs = await db.select().from(aiPromptDefinition)
    .then(d => d.filter(x => x.key === "research.team"));
  
  for (const def of defs) {
    const pub = await db.select().from(aiPromptRevision)
      .where(eq(aiPromptRevision.definitionId, def.id))
      .then(r => r.filter(x => x.status === "published")[0]);
    
    if (pub) {
      console.log(pub.systemPrompt);
    }
  }
  process.exit(0);
}

dump().catch(e => { console.error(e); process.exit(1); });
