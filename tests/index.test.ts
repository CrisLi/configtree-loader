import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfigTree, loadConfigTreeSync } from "../src/index.js";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "configtree-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Write a file relative to tmpDir, creating parent directories as needed. */
function writeFile(relPath: string, content: string): void {
  const fullPath = join(tmpDir, relPath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}

/** Create a subdirectory of tmpDir and return its path. */
function makeDir(relPath: string): string {
  const fullPath = join(tmpDir, relPath);
  mkdirSync(fullPath, { recursive: true });
  return fullPath;
}

// ---------------------------------------------------------------------------
// Sync API — single path
// ---------------------------------------------------------------------------

describe("loadConfigTreeSync — single path", () => {
  it("returns an empty object for an empty directory", () => {
    expect(loadConfigTreeSync(tmpDir)).toEqual({});
  });

  it("reads flat files into a flat object", () => {
    writeFile("DATABASE_HOST", "localhost");
    writeFile("DATABASE_PORT", "5432");
    expect(loadConfigTreeSync(tmpDir)).toEqual({
      DATABASE_HOST: "localhost",
      DATABASE_PORT: "5432",
    });
  });

  it("ignores subdirectories", () => {
    writeFile("DATABASE_HOST", "localhost");
    writeFile("subdir/NESTED_KEY", "should-be-ignored");
    expect(loadConfigTreeSync(tmpDir)).toEqual({ DATABASE_HOST: "localhost" });
  });

  it("trims leading and trailing whitespace from file values", () => {
    writeFile("KEY", "  value with spaces  \n");
    expect(loadConfigTreeSync(tmpDir)).toEqual({ KEY: "value with spaces" });
  });

  it("trims newlines surrounding the value", () => {
    writeFile("TOKEN", "\n  abc123  \n");
    expect(loadConfigTreeSync(tmpDir)).toEqual({ TOKEN: "abc123" });
  });

  it("preserves inner newlines within a value (only trims edges)", () => {
    writeFile("MULTILINE", "line1\nline2\nline3");
    expect(loadConfigTreeSync(tmpDir)).toEqual({ MULTILINE: "line1\nline2\nline3" });
  });

  it("handles empty file values (trimmed to empty string)", () => {
    writeFile("EMPTY", "");
    expect(loadConfigTreeSync(tmpDir)).toEqual({ EMPTY: "" });
  });

  it("handles files with only whitespace (trimmed to empty string)", () => {
    writeFile("BLANK", "   \n  ");
    expect(loadConfigTreeSync(tmpDir)).toEqual({ BLANK: "" });
  });

  it("throws for a non-existent directory without optional flag", () => {
    expect(() => loadConfigTreeSync("/nonexistent/configtree-loader-xyz")).toThrow(
      "configtree-loader: directory not found",
    );
  });

  it("returns an empty object for non-existent directory with optional: true", () => {
    expect(loadConfigTreeSync("/nonexistent/configtree-loader-xyz", { optional: true })).toEqual(
      {},
    );
  });

  it("throws when the path is a file, not a directory", () => {
    writeFile("afile", "content");
    expect(() => loadConfigTreeSync(join(tmpDir, "afile"))).toThrow(
      "configtree-loader: path is not a directory",
    );
  });
});

// ---------------------------------------------------------------------------
// Sync API — array of paths
// ---------------------------------------------------------------------------

describe("loadConfigTreeSync — array of paths", () => {
  it("merges files from multiple directories", () => {
    const dir1 = makeDir("db");
    const dir2 = makeDir("kafka");
    writeFileSync(join(dir1, "DATABASE_HOST"), "localhost");
    writeFileSync(join(dir2, "KAFKA_BOOTSTRAP_SERVERS"), "broker:9092");
    expect(loadConfigTreeSync([dir1, dir2])).toEqual({
      DATABASE_HOST: "localhost",
      KAFKA_BOOTSTRAP_SERVERS: "broker:9092",
    });
  });

  it("later directory overwrites earlier directory for the same key", () => {
    const dir1 = makeDir("base");
    const dir2 = makeDir("override");
    writeFileSync(join(dir1, "DATABASE_PASSWORD"), "base-password");
    writeFileSync(join(dir2, "DATABASE_PASSWORD"), "override-password");
    expect(loadConfigTreeSync([dir1, dir2])).toEqual({ DATABASE_PASSWORD: "override-password" });
  });

  it("skips missing directories when optional: true", () => {
    const dir1 = makeDir("real");
    writeFileSync(join(dir1, "KEY"), "value");
    expect(
      loadConfigTreeSync([dir1, "/nonexistent/configtree-loader-xyz"], { optional: true }),
    ).toEqual({ KEY: "value" });
  });

  it("throws on first missing directory when optional: false", () => {
    const dir1 = makeDir("real");
    writeFileSync(join(dir1, "KEY"), "value");
    expect(() => loadConfigTreeSync([dir1, "/nonexistent/configtree-loader-xyz"])).toThrow(
      "configtree-loader: directory not found",
    );
  });

  it("returns an empty object for an empty array", () => {
    expect(loadConfigTreeSync([])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Async API — single path
// ---------------------------------------------------------------------------

describe("loadConfigTree (async) — single path", () => {
  it("returns an empty object for an empty directory", async () => {
    await expect(loadConfigTree(tmpDir)).resolves.toEqual({});
  });

  it("reads flat files into a flat object", async () => {
    writeFile("DATABASE_HOST", "localhost");
    writeFile("DATABASE_PORT", "5432");
    await expect(loadConfigTree(tmpDir)).resolves.toEqual({
      DATABASE_HOST: "localhost",
      DATABASE_PORT: "5432",
    });
  });

  it("ignores subdirectories", async () => {
    writeFile("DATABASE_HOST", "localhost");
    writeFile("subdir/NESTED_KEY", "should-be-ignored");
    await expect(loadConfigTree(tmpDir)).resolves.toEqual({ DATABASE_HOST: "localhost" });
  });

  it("trims whitespace from file values", async () => {
    writeFile("KEY", "  value  \n");
    await expect(loadConfigTree(tmpDir)).resolves.toEqual({ KEY: "value" });
  });

  it("handles empty file values (trimmed to empty string)", async () => {
    writeFile("EMPTY", "");
    await expect(loadConfigTree(tmpDir)).resolves.toEqual({ EMPTY: "" });
  });

  it("throws for a non-existent directory without optional flag", async () => {
    await expect(loadConfigTree("/nonexistent/configtree-loader-xyz")).rejects.toThrow(
      "configtree-loader: directory not found",
    );
  });

  it("returns an empty object for non-existent directory with optional: true", async () => {
    await expect(
      loadConfigTree("/nonexistent/configtree-loader-xyz", { optional: true }),
    ).resolves.toEqual({});
  });

  it("throws when the path is a file, not a directory", async () => {
    writeFile("afile", "content");
    await expect(loadConfigTree(join(tmpDir, "afile"))).rejects.toThrow(
      "configtree-loader: path is not a directory",
    );
  });

  it("handles a large number of files in parallel", async () => {
    const expected: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      writeFile(`KEY_${String(i)}`, `value${String(i)}`);
      expected[`KEY_${String(i)}`] = `value${String(i)}`;
    }
    await expect(loadConfigTree(tmpDir)).resolves.toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Async API — array of paths
// ---------------------------------------------------------------------------

describe("loadConfigTree (async) — array of paths", () => {
  it("merges files from multiple directories", async () => {
    const dir1 = makeDir("db");
    const dir2 = makeDir("kafka");
    writeFileSync(join(dir1, "DATABASE_HOST"), "localhost");
    writeFileSync(join(dir2, "KAFKA_BOOTSTRAP_SERVERS"), "broker:9092");
    await expect(loadConfigTree([dir1, dir2])).resolves.toEqual({
      DATABASE_HOST: "localhost",
      KAFKA_BOOTSTRAP_SERVERS: "broker:9092",
    });
  });

  it("later directory overwrites earlier directory for the same key", async () => {
    const dir1 = makeDir("base");
    const dir2 = makeDir("override");
    writeFileSync(join(dir1, "DATABASE_PASSWORD"), "base-password");
    writeFileSync(join(dir2, "DATABASE_PASSWORD"), "override-password");
    await expect(loadConfigTree([dir1, dir2])).resolves.toEqual({
      DATABASE_PASSWORD: "override-password",
    });
  });

  it("skips missing directories when optional: true", async () => {
    const dir1 = makeDir("real");
    writeFileSync(join(dir1, "KEY"), "value");
    await expect(
      loadConfigTree([dir1, "/nonexistent/configtree-loader-xyz"], { optional: true }),
    ).resolves.toEqual({ KEY: "value" });
  });

  it("throws on first missing directory when optional: false", async () => {
    const dir1 = makeDir("real");
    writeFileSync(join(dir1, "KEY"), "value");
    await expect(loadConfigTree([dir1, "/nonexistent/configtree-loader-xyz"])).rejects.toThrow(
      "configtree-loader: directory not found",
    );
  });

  it("returns an empty object for an empty array", async () => {
    await expect(loadConfigTree([])).resolves.toEqual({});
  });

  it("sync and async produce identical results for the same paths", async () => {
    const dir1 = makeDir("db");
    const dir2 = makeDir("overrides");
    writeFileSync(join(dir1, "DATABASE_HOST"), "localhost");
    writeFileSync(join(dir1, "DATABASE_PORT"), "5432");
    writeFileSync(join(dir2, "DATABASE_PORT"), "5433");

    const syncResult = loadConfigTreeSync([dir1, dir2]);
    const asyncResult = await loadConfigTree([dir1, dir2]);
    expect(syncResult).toEqual(asyncResult);
  });
});

// ---------------------------------------------------------------------------
// Symlink support (Kubernetes configmap/secret volume mounts)
// ---------------------------------------------------------------------------

describe("loadConfigTreeSync — symlinks", () => {
  it("reads symlinked files as config values", () => {
    // Simulate Kubernetes-style symlink layout:
    // DATABASE_HOST -> ..data/DATABASE_HOST (symlink to actual file)
    const dataDir = makeDir("..data");
    writeFileSync(join(dataDir, "DATABASE_HOST"), "k8s-host");
    symlinkSync(join(dataDir, "DATABASE_HOST"), join(tmpDir, "DATABASE_HOST"));

    expect(loadConfigTreeSync(tmpDir)).toEqual({ DATABASE_HOST: "k8s-host" });
  });

  it("ignores symlinks pointing to directories", () => {
    writeFile("REAL_KEY", "value");
    const subDir = makeDir("target-dir");
    symlinkSync(subDir, join(tmpDir, "DIR_LINK"));

    expect(loadConfigTreeSync(tmpDir)).toEqual({ REAL_KEY: "value" });
  });
});

describe("loadConfigTree (async) — symlinks", () => {
  it("reads symlinked files as config values", async () => {
    const dataDir = makeDir("..data");
    writeFileSync(join(dataDir, "DATABASE_HOST"), "k8s-host");
    symlinkSync(join(dataDir, "DATABASE_HOST"), join(tmpDir, "DATABASE_HOST"));

    await expect(loadConfigTree(tmpDir)).resolves.toEqual({ DATABASE_HOST: "k8s-host" });
  });

  it("ignores symlinks pointing to directories", async () => {
    writeFile("REAL_KEY", "value");
    const subDir = makeDir("target-dir");
    symlinkSync(subDir, join(tmpDir, "DIR_LINK"));

    await expect(loadConfigTree(tmpDir)).resolves.toEqual({ REAL_KEY: "value" });
  });
});
