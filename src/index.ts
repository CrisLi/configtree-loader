import { readdirSync, readFileSync, statSync } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { join, relative, sep } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A nested config object. Values are always strings (trimmed file contents).
 * Intermediate nodes are always plain objects.
 */
export type ConfigValue = string | ConfigObject;
export type ConfigObject = { [key: string]: ConfigValue };

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

/**
 * Recursively sets a value at a key path on an object, creating intermediate
 * objects as needed.
 *
 * Throws if a path segment collides with an existing string value.
 */
function setNested(obj: ConfigObject, pathParts: string[], value: string): void {
  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i] as string;
    if (!(part in current)) {
      current[part] = {} as ConfigObject;
    }
    const next = current[part];
    if (next === undefined) {
      // Should never happen — we just assigned it above if it was missing
      throw new Error(`configtree-loader: unexpected undefined at key "${part}"`);
    }
    if (typeof next === "string") {
      throw new Error(
        `configtree-loader: path conflict at "${pathParts.slice(0, i + 1).join(".")}" — ` +
          `a file and a directory share the same name`,
      );
    }
    current = next;
  }
  const lastPart = pathParts[pathParts.length - 1] as string;
  current[lastPart] = value;
}

/** Synchronously walk a directory tree, returning all file paths. */
function walkSync(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSync(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
    // Symlinks and other special files are intentionally ignored
  }
  return results;
}

/** Asynchronously walk a directory tree, returning all file paths. */
async function walkAsync(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await walkAsync(fullPath);
        results.push(...sub);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }),
  );
  return results;
}

/**
 * Convert an absolute file path to an array of key segments relative to root.
 *
 * @example
 * toKeyParts("/etc/config", "/etc/config/db/credentials/username")
 * // => ["db", "credentials", "username"]
 */
function toKeyParts(root: string, filePath: string): string[] {
  return relative(root, filePath).split(sep);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Synchronously load a configtree directory into a nested config object.
 *
 * Each file's path relative to `dirPath` becomes a nested key, and the
 * file's content (trimmed) becomes the value.
 *
 * @example
 * // Directory: /etc/config/db/host → "localhost", /etc/config/db/port → "5432"
 * const config = loadConfigTreeSync("/etc/config");
 * // => { db: { host: "localhost", port: "5432" } }
 */
export function loadConfigTreeSync(dirPath: string, options: LoadOptions = {}): ConfigObject {
  const { optional = false } = options;

  try {
    const s = statSync(dirPath);
    if (!s.isDirectory()) {
      throw new Error(`configtree-loader: path is not a directory: ${dirPath}`);
    }
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      if (optional) return {};
      throw new Error(`configtree-loader: directory not found: ${dirPath}`);
    }
    throw err;
  }

  const result: ConfigObject = {};
  const files = walkSync(dirPath);

  for (const filePath of files) {
    const parts = toKeyParts(dirPath, filePath);
    const raw = readFileSync(filePath, "utf8");
    setNested(result, parts, raw.trim());
  }

  return result;
}

/**
 * Asynchronously load a configtree directory into a nested config object.
 *
 * Each file's path relative to `dirPath` becomes a nested key, and the
 * file's content (trimmed) becomes the value.
 *
 * @example
 * // Directory: /etc/config/db/host → "localhost", /etc/config/db/port → "5432"
 * const config = await loadConfigTree("/etc/config");
 * // => { db: { host: "localhost", port: "5432" } }
 */
export async function loadConfigTree(
  dirPath: string,
  options: LoadOptions = {},
): Promise<ConfigObject> {
  const { optional = false } = options;

  try {
    const s = await stat(dirPath);
    if (!s.isDirectory()) {
      throw new Error(`configtree-loader: path is not a directory: ${dirPath}`);
    }
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      if (optional) return {};
      throw new Error(`configtree-loader: directory not found: ${dirPath}`);
    }
    throw err;
  }

  const files = await walkAsync(dirPath);

  // Read all files in parallel, then assemble result serially to avoid races
  const entries = await Promise.all(
    files.map(async (filePath) => {
      const raw = await readFile(filePath, "utf8");
      return { parts: toKeyParts(dirPath, filePath), value: raw.trim() };
    }),
  );

  const result: ConfigObject = {};
  for (const { parts, value } of entries) {
    setNested(result, parts, value);
  }
  return result;
}
