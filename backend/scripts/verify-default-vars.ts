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
     WHERE r.status = $1 AND d.key LIKE $2 AND r.stage IS NULL
     ORDER BY d.key`,
    ["published", "evaluation.%"],
  );

  for (const row of rows) {
    const r = row as { key: string; stage: string | null; user_prompt: string };
    const vars =
      r.user_prompt.match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g) || [];
    console.log(
      r.key,
      "[default]",
      "vars:",
      [...new Set(vars)].join(", "),
    );
  }

  await client.end();
}

main().catch(console.error);
