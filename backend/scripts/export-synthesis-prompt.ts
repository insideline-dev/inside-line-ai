import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const { rows } = await client.query(
    `SELECT d.key, r.stage, r.user_prompt
     FROM ai_prompt_revisions r
     JOIN ai_prompt_definitions d ON r.definition_id = d.id
     WHERE r.status = $1 AND d.key = $2 AND r.stage = $3`,
    ["published", "synthesis.final", "seed"],
  );

  if (rows.length > 0) {
    const r = rows[0] as { user_prompt: string };
    console.log("=== SEED USER PROMPT ===");
    console.log(r.user_prompt);
    console.log("\n=== VARIABLES USED ===");
    const vars = r.user_prompt.match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g) || [];
    console.log([...new Set(vars)].join("\n"));
  }

  await client.end();
}

main().catch(console.error);
