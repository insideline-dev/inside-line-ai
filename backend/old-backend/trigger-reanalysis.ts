import { analyzeStartup } from "./langchain-agents";

async function triggerReanalysis(startupId: number) {
  console.log(`Starting re-analysis for startup ${startupId}...`);
  
  try {
    console.log("Running full analysis with updated prompts...");
    await analyzeStartup(startupId);
    console.log(`\n✓ Analysis complete for startup ${startupId}`);
  } catch (error) {
    console.error("Analysis failed:", error);
  }
}

const startupId = parseInt(process.argv[2] || "3");
triggerReanalysis(startupId)
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
