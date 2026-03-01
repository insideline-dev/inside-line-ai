import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const { rows: seeds } = await client.query(
    `SELECT d.key, r.user_prompt, r.system_prompt
     FROM ai_prompt_revisions r
     JOIN ai_prompt_definitions d ON r.definition_id = d.id
     WHERE r.status = $1 AND d.key LIKE $2 AND r.stage = $3`,
    ["published", "synthesis.%", "seed"],
  );

  const { rows: defaults } = await client.query(
    `SELECT d.key, r.id, r.stage
     FROM ai_prompt_revisions r
     JOIN ai_prompt_definitions d ON r.definition_id = d.id
     WHERE r.status = $1 AND d.key LIKE $2 AND r.stage IS NULL`,
    ["published", "synthesis.%"],
  );

  console.log("Seed prompts found:", seeds.length);
  console.log("Target defaults:", defaults.length);

  let updated = 0;
  for (const target of defaults) {
    const seed = seeds.find((s: { key: string }) => s.key === target.key);
    if (!seed) {
      console.log("SKIP: no seed for", target.key);
      continue;
    }
    await client.query(
      "UPDATE ai_prompt_revisions SET user_prompt = $1, system_prompt = $2, updated_at = NOW() WHERE id = $3",
      [seed.user_prompt, seed.system_prompt, target.id],
    );
    console.log(
      "UPDATED:",
      target.key,
      "[default]",
      "->",
      seed.user_prompt.length,
      "chars",
    );
    updated++;
  }

  console.log("\nTotal updated:", updated);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
