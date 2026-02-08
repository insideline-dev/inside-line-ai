#!/usr/bin/env bun

import { spawn, type Subprocess } from "bun";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";

const BACKEND_DIR = join(import.meta.dir, "../../backend");
const BACKEND_URL = "http://localhost:8080";
const HEALTH_CHECK_URL = `${BACKEND_URL}/health`;
const OPENAPI_URL = `${BACKEND_URL}/docs-json`;
const OUTPUT_FILE = join(import.meta.dir, "../openapi.json");
const HEALTH_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;

let backendProcess: Subprocess | null = null;

function log(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function cleanup() {
  if (backendProcess) {
    log("Killing backend process...");
    backendProcess.kill();
    backendProcess = null;
  }
}

async function waitForBackend(): Promise<void> {
  const startTime = Date.now();
  log(`Waiting for backend to be healthy (timeout: ${HEALTH_TIMEOUT_MS / 1000}s)...`);

  while (Date.now() - startTime < HEALTH_TIMEOUT_MS) {
    try {
      const response = await fetch(HEALTH_CHECK_URL, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        log("Backend is healthy!");
        return;
      }
    } catch {
      // Ignore errors, keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Backend health check timeout");
}

function fixOpenApiSpec(spec: any): any {
  function fixSchema(obj: any) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      obj.forEach((item) => fixSchema(item));
      return;
    }

    // Fix exclusiveMinimum/Maximum: OAS 3.0 requires boolean, not number
    if (typeof obj.exclusiveMinimum === "number") {
      obj.minimum = obj.exclusiveMinimum;
      obj.exclusiveMinimum = true;
    }
    if (typeof obj.exclusiveMaximum === "number") {
      obj.maximum = obj.exclusiveMaximum;
      obj.exclusiveMaximum = true;
    }

    // Replace empty additionalProperties with true
    if (
      obj.additionalProperties !== undefined &&
      typeof obj.additionalProperties === "object" &&
      Object.keys(obj.additionalProperties).length === 0
    ) {
      obj.additionalProperties = true;
    }

    // Remove propertyNames (not valid in OAS 3.0)
    if (obj.propertyNames !== undefined) {
      delete obj.propertyNames;
    }

    for (const key in obj) {
      fixSchema(obj[key]);
    }
  }

  fixSchema(spec);
  return spec;
}

async function main() {
  try {
    // 1. Start backend
    log("Starting backend server...");
    backendProcess = spawn({
      cmd: ["bun", "run", "start"],
      cwd: BACKEND_DIR,
      stdout: "pipe",
      stderr: "pipe",
    });

    // 2. Wait for health check
    await waitForBackend();

    // 3. Fetch OpenAPI spec
    log("Fetching OpenAPI spec...");
    const response = await fetch(OPENAPI_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`);
    }
    const spec = await response.json();
    log("OpenAPI spec fetched successfully");

    // 4. Fix OAS 3.0 compatibility issues
    log("Fixing OAS 3.0 compatibility issues...");
    const fixedSpec = fixOpenApiSpec(spec);

    // 5. Write fixed spec
    writeFileSync(OUTPUT_FILE, JSON.stringify(fixedSpec, null, 2));
    log(`OpenAPI spec written to ${OUTPUT_FILE}`);

    // 6. Run orval
    log("Running orval...");
    const orvalProcess = spawn({
      cmd: ["bunx", "orval"],
      cwd: join(import.meta.dir, ".."),
      stdout: "inherit",
      stderr: "inherit",
    });
    await orvalProcess.exited;

    if (orvalProcess.exitCode !== 0) {
      throw new Error(`Orval failed with exit code ${orvalProcess.exitCode}`);
    }

    log("API generation complete!");
    cleanup();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    cleanup();
    process.exit(1);
  }
}

// Handle cleanup on interrupt
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

main();
