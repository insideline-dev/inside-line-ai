import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const res = await client.query(
    `SELECT d.key, r.stage, length(r.user_prompt) as len
     FROM ai_prompt_revisions r
     JOIN ai_prompt_definitions d ON r.definition_id = d.id
     WHERE r.status = $1 AND d.key LIKE $2
     ORDER BY d.key, r.stage NULLS LAST`,
    ["published", "evaluation.%"],
  );

  const grouped: Record<string, Record<string, number>> = {};
  for (const r of res.rows) {
    const stage = (r as { stage: string | null }).stage || "default";
    const key = (r as { key: string }).key;
    const len = parseInt(String((r as { len: string }).len));
    if (!grouped[key]) grouped[key] = {};
    grouped[key][stage] = len;
  }

  let allMatch = true;
  for (const [key, stages] of Object.entries(grouped)) {
    const seedLen = stages["seed"];
    const defaultLen = stages["default"];
    const match = seedLen === defaultLen ? "OK" : "MISMATCH";
    if (match !== "OK") allMatch = false;
    console.log(key, "seed=" + seedLen, "default=" + defaultLen, match);
  }

  console.log(allMatch ? "\nALL DEFAULTS MATCH SEED" : "\nSOME MISMATCHES FOUND");
  await client.end();
}

main().catch(console.error);
