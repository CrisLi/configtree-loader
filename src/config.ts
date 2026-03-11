import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "yaml";
import { loadConfigTreeSync } from "./loader.js";
import { isNodeError } from "./utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppConfig {
  /** Merged key→value pairs loaded from all configured configtree directories. */
  configtreeValues: Record<string, string>;
  /** All other top-level keys from app.yaml. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Core builder (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build an AppConfig from a YAML file at `filePath`.
 *
 * - Missing file (ENOENT) → returns `{ configtreeValues: {} }`
 * - Other readFileSync errors propagate as-is
 * - Invalid YAML or non-mapping top-level → throws
 * - `configtrees` paths are resolved relative to `process.cwd()`
 */
export function _buildConfig(filePath: string): AppConfig {
  // 1. Read the file
  let source: string;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return { configtreeValues: {} };
    }
    throw err;
  }

  // 2. Parse YAML and assert top-level is a mapping
  const parsed: unknown = parse(source);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("configtree-loader: app.yaml must be a YAML mapping");
  }

  // 3. Extract and strip configtrees from the base object
  const base = parsed as Record<string, unknown>;
  const rawTrees: unknown = base["configtrees"];
  const trees: string[] = Array.isArray(rawTrees)
    ? rawTrees.filter((p): p is string => typeof p === "string")
    : [];

  const { configtrees: _stripped, ...rest } = base;

  // 4. Load and merge configtree directories (one per path for clear error attribution)
  const configtreeValues: Record<string, string> = {};
  for (const treePath of trees) {
    const absPath = resolve(process.cwd(), treePath);
    const entries = loadConfigTreeSync(absPath);
    Object.assign(configtreeValues, entries);
  }

  // 5. Computed configtreeValues always wins over any yaml key of the same name
  return { ...rest, configtreeValues };
}

// ---------------------------------------------------------------------------
// Singleton — loaded once at import time
// ---------------------------------------------------------------------------

export const config: AppConfig = _buildConfig(
  process.env["APP_CONFIG_FILE"] ?? resolve(process.cwd(), "config/app.yaml"),
);
