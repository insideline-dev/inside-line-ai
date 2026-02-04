#!/usr/bin/env node
/**
 * fix-api-types.js
 *
 * After running openapi-typescript-codegen, this script:
 * 1. Removes the generated models/ directory
 * 2. Scans service files for type usages and imports them from @shared/schemas
 * 3. Updates index.ts to re-export from @shared/schemas
 *
 * Usage: node scripts/fix-api-types.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_CLIENT_DIR = path.join(__dirname, "../src/lib/api-client");
const SERVICES_DIR = path.join(API_CLIENT_DIR, "services");
const MODELS_DIR = path.join(API_CLIENT_DIR, "models");
const INDEX_FILE = path.join(API_CLIENT_DIR, "index.ts");

// Known types exported from @shared/schemas
// Add new types here as you create new schemas
const SHARED_TYPES = new Set([
  // Common
  "Uuid",
  "Timestamps",
  "IdParams",
  "IdResponse",
  // Todo
  "Todo",
  "CreateTodoInput",
  "UpdateTodoInput",
  "TodoResponse",
  "TodoListResponse",
  // User
  "User",
  "CreateUserInput",
  "UserResponse",
]);

// Remove models directory
if (fs.existsSync(MODELS_DIR)) {
  fs.rmSync(MODELS_DIR, { recursive: true, force: true });
  console.log("✓ Removed models/ directory");
}

// Update service files
if (fs.existsSync(SERVICES_DIR)) {
  const serviceFiles = fs.readdirSync(SERVICES_DIR).filter((f) => f.endsWith(".ts"));

  for (const file of serviceFiles) {
    const filePath = path.join(SERVICES_DIR, file);
    let content = fs.readFileSync(filePath, "utf-8");

    // Remove any existing model imports
    content = content.replace(
      /import type \{[^}]+\} from ['"]\.\.\/models[^'"]*['"];?\n?/g,
      ""
    );

    // Remove any existing @shared/schemas imports
    content = content.replace(
      /import type \{[^}]+\} from ['"]@shared\/schemas['"];?\n?/g,
      ""
    );

    // Find all type usages in the file that match our known shared types
    const usedTypes = new Set();
    for (const typeName of SHARED_TYPES) {
      // Match type in various contexts:
      // - : TypeName (parameter/return type)
      // - <TypeName> (generic)
      // - TypeName, (in generics list)
      const patterns = [
        new RegExp(`:\\s*${typeName}\\b`),
        new RegExp(`<${typeName}>`),
        new RegExp(`<${typeName},`),
        new RegExp(`,\\s*${typeName}>`),
      ];
      if (patterns.some((p) => p.test(content))) {
        usedTypes.add(typeName);
      }
    }

    // Add import for used types
    if (usedTypes.size > 0) {
      const sortedTypes = Array.from(usedTypes).sort();
      const importStatement = `import type { ${sortedTypes.join(", ")} } from "@shared/schemas";\n`;

      // Find first import statement and insert before it
      const firstImportMatch = content.match(/^import /m);
      if (firstImportMatch) {
        const insertPos = content.indexOf(firstImportMatch[0]);
        content = content.slice(0, insertPos) + importStatement + content.slice(insertPos);
      } else {
        content = importStatement + content;
      }
    }

    fs.writeFileSync(filePath, content);
    const typesStr = usedTypes.size > 0 ? ` (${Array.from(usedTypes).sort().join(", ")})` : "";
    console.log(`✓ Updated ${file}${typesStr}`);
  }
}

// Update index.ts
if (fs.existsSync(INDEX_FILE)) {
  let indexContent = fs.readFileSync(INDEX_FILE, "utf-8");

  // Remove model exports
  indexContent = indexContent.replace(/export \* from ['"]\.\/models[^'"]*['"];?\n?/g, "");

  // Add shared re-export if not present
  if (!indexContent.includes("@shared/schemas")) {
    indexContent += `\nexport * from "@shared/schemas";\n`;
  }

  fs.writeFileSync(INDEX_FILE, indexContent);
  console.log("✓ Updated index.ts exports");
}

console.log("\n✓ API types fixed successfully");
