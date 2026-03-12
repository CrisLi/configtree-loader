import { readdirSync, readFileSync, statSync } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { basename, join } from "path";
import { isNodeError } from "./utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A flat map of string keys to string values.
 * Each key is a filename; each value is the trimmed file content.
 */
export type ConfigObject = Record<string, string>;

export interface LoadOptions {
  /**
   * If true, a missing root directory returns {} instead of throwing.
   * Mirrors Spring Boot's `optional:configtree:` prefix.
   * @default false
   */
  optional?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Check that a path is an existing directory. Returns false if missing and optional=true. */
function checkDirSync(dirPath: string, optional: boolean): boolean {
  try {
    const s = statSync(dirPath);
    if (!s.isDirectory()) {
      throw new Error(`configtree-loader: path is not a directory: ${dirPath}`);
    }
    return true;
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      if (optional) return false;
      throw new Error(`configtree-loader: directory not found: ${dirPath}`);
    }
    throw err;
  }
}

/** Check that a path is an existing directory. Returns false if missing and optional=true. */
async function checkDirAsync(dirPath: string, optional: boolean): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    if (!s.isDirectory()) {
      throw new Error(`configtree-loader: path is not a directory: ${dirPath}`);
    }
    return true;
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      if (optional) return false;
      throw new Error(`configtree-loader: directory not found: ${dirPath}`);
    }
    throw err;
  }
}

/** Return paths of direct files in a directory (subdirectories are skipped). */
function listFilesSync(dirPath: string): string[] {
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => {
      if (e.isFile()) return true;
      if (e.isSymbolicLink()) return statSync(join(dirPath, e.name)).isFile();
      return false;
    })
    .map((e) => join(dirPath, e.name));
}

/** Return paths of direct files in a directory (subdirectories are skipped). */
async function listFilesAsync(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const results: string[] = [];
  for (const e of entries) {
    if (e.isFile()) {
      results.push(join(dirPath, e.name));
    } else if (e.isSymbolicLink()) {
      const s = await stat(join(dirPath, e.name));
      if (s.isFile()) results.push(join(dirPath, e.name));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Synchronously load one or more configtree directories into a flat config object.
 *
 * Only direct files are read — subdirectories are ignored. Each filename
 * becomes a key and the file's trimmed content becomes the value. When
 * multiple directories are provided, later directories overwrite earlier ones
 * for the same key.
 *
 * @example
 * // /etc/config/db/DATABASE_HOST → "localhost"
 * // /etc/config/db/DATABASE_PORT → "5432"
 * const config = loadConfigTreeSync("/etc/config/db");
 * // => { DATABASE_HOST: "localhost", DATABASE_PORT: "5432" }
 *
 * @example
 * // Merge multiple config trees; later entries win on conflict
 * const config = loadConfigTreeSync(["/etc/config/db", "/etc/config/overrides"]);
 */
export function loadConfigTreeSync(
  dirPath: string | string[],
  options: LoadOptions = {},
): ConfigObject {
  const { optional = false } = options;
  const paths = Array.isArray(dirPath) ? dirPath : [dirPath];
  const result: ConfigObject = {};

  for (const p of paths) {
    if (!checkDirSync(p, optional)) continue;
    for (const filePath of listFilesSync(p)) {
      result[basename(filePath)] = readFileSync(filePath, "utf8").trim();
    }
  }

  return result;
}

/**
 * Asynchronously load one or more configtree directories into a flat config object.
 *
 * Only direct files are read — subdirectories are ignored. Each filename
 * becomes a key and the file's trimmed content becomes the value. When
 * multiple directories are provided, later directories overwrite earlier ones
 * for the same key.
 *
 * @example
 * // /etc/config/db/DATABASE_HOST → "localhost"
 * // /etc/config/db/DATABASE_PORT → "5432"
 * const config = await loadConfigTree("/etc/config/db");
 * // => { DATABASE_HOST: "localhost", DATABASE_PORT: "5432" }
 *
 * @example
 * // Merge multiple config trees; later entries win on conflict
 * const config = await loadConfigTree(["/etc/config/db", "/etc/config/overrides"]);
 */
export async function loadConfigTree(
  dirPath: string | string[],
  options: LoadOptions = {},
): Promise<ConfigObject> {
  const { optional = false } = options;
  const paths = Array.isArray(dirPath) ? dirPath : [dirPath];
  const result: ConfigObject = {};

  for (const p of paths) {
    if (!(await checkDirAsync(p, optional))) continue;
    const files = await listFilesAsync(p);
    const entries = await Promise.all(
      files.map(async (filePath) => ({
        key: basename(filePath),
        value: (await readFile(filePath, "utf8")).trim(),
      })),
    );
    for (const { key, value } of entries) {
      result[key] = value;
    }
  }

  return result;
}
