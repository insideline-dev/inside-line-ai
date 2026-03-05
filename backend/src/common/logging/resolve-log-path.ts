import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

function resolveBackendRoot(cwd: string): string {
  const backendFromWorkspace = resolve(cwd, "backend");
  if (existsSync(resolve(backendFromWorkspace, "package.json"))) {
    return backendFromWorkspace;
  }

  const looksLikeBackendDir =
    existsSync(resolve(cwd, "package.json")) &&
    existsSync(resolve(cwd, "src"));
  if (looksLikeBackendDir) {
    return cwd;
  }

  return cwd;
}

export function resolveBackendLogPath(filePath: string): string {
  if (isAbsolute(filePath)) {
    return filePath;
  }

  const cwd = process.cwd();
  const backendRoot = resolveBackendRoot(cwd);
  return resolve(backendRoot, filePath);
}

