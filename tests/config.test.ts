import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _buildConfig } from "../src/config.js";

// ---------------------------------------------------------------------------
// Fixture helpers (mirrors tests/index.test.ts)
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "configtree-config-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Write a YAML file inside tmpDir and return its absolute path. */
function writeYaml(relPath: string, content: string): string {
  const fullPath = join(tmpDir, relPath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

/** Create a subdirectory of tmpDir and return its absolute path. */
function makeDir(relPath: string): string {
  const fullPath = join(tmpDir, relPath);
  mkdirSync(fullPath, { recursive: true });
  return fullPath;
}

// ---------------------------------------------------------------------------
// Missing / unreadable yaml file
// ---------------------------------------------------------------------------

describe("_buildConfig — missing or unreadable file", () => {
  it("returns { configtreeValues: {} } when yaml file does not exist (ENOENT)", () => {
    const result = _buildConfig(join(tmpDir, "nonexistent.yaml"));
    expect(result).toEqual({ configtreeValues: {} });
  });

  it("propagates non-ENOENT errors (EISDIR: path is a directory)", () => {
    const dirPath = makeDir("a-dir");
    // readFileSync on a directory throws EISDIR on Linux/macOS
    expect(() => _buildConfig(dirPath)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Valid YAML — no configtrees key
// ---------------------------------------------------------------------------

describe("_buildConfig — valid yaml without configtrees", () => {
  it("returns yaml values and empty configtreeValues when no configtrees key", () => {
    const yamlPath = writeYaml("app.yaml", "app:\n  name: my-service\n  port: 8080\n");
    const result = _buildConfig(yamlPath);
    expect(result).toEqual({
      app: { name: "my-service", port: 8080 },
      configtreeValues: {},
    });
  });

  it("strips the configtrees key from the output", () => {
    const dir = makeDir("db");
    writeFileSync(join(dir, "DB_HOST"), "localhost");
    const yamlPath = writeYaml("app.yaml", `configtrees:\n  - ${dir}\n`);
    const result = _buildConfig(yamlPath);
    expect(result).not.toHaveProperty("configtrees");
  });
});

// ---------------------------------------------------------------------------
// Valid YAML — with configtrees
// ---------------------------------------------------------------------------

describe("_buildConfig — yaml with configtrees", () => {
  it("loads a single configtree directory into configtreeValues", () => {
    const dir = makeDir("db");
    writeFileSync(join(dir, "DB_HOST"), "localhost");
    writeFileSync(join(dir, "DB_PORT"), "5432");
    const yamlPath = writeYaml("app.yaml", `configtrees:\n  - ${dir}\n`);

    const result = _buildConfig(yamlPath);
    expect(result.configtreeValues).toEqual({ DB_HOST: "localhost", DB_PORT: "5432" });
  });

  it("merges multiple configtree directories; later path wins on conflict", () => {
    const dir1 = makeDir("base");
    const dir2 = makeDir("override");
    writeFileSync(join(dir1, "DB_HOST"), "localhost");
    writeFileSync(join(dir1, "DB_PORT"), "5432");
    writeFileSync(join(dir2, "DB_PORT"), "5433");
    const yamlPath = writeYaml("app.yaml", `configtrees:\n  - ${dir1}\n  - ${dir2}\n`);

    const result = _buildConfig(yamlPath);
    expect(result.configtreeValues).toEqual({ DB_HOST: "localhost", DB_PORT: "5433" });
  });

  it("merges yaml top-level values alongside configtreeValues", () => {
    const dir = makeDir("db");
    writeFileSync(join(dir, "DB_HOST"), "localhost");
    const yamlPath = writeYaml("app.yaml", `configtrees:\n  - ${dir}\napp:\n  name: svc\n`);

    const result = _buildConfig(yamlPath);
    expect(result["app"]).toEqual({ name: "svc" });
    expect(result.configtreeValues).toEqual({ DB_HOST: "localhost" });
  });

  it("overwrites a yaml configtreeValues key with computed result", () => {
    const dir = makeDir("db");
    writeFileSync(join(dir, "DB_HOST"), "real-host");
    const yamlPath = writeYaml(
      "app.yaml",
      `configtrees:\n  - ${dir}\nconfigtreeValues:\n  DB_HOST: yaml-host\n`,
    );

    const result = _buildConfig(yamlPath);
    // computed configtreeValues wins over yaml key
    expect(result.configtreeValues).toEqual({ DB_HOST: "real-host" });
  });

  it("throws when a declared configtree directory does not exist", () => {
    const yamlPath = writeYaml(
      "app.yaml",
      `configtrees:\n  - /nonexistent/__configtree-loader-xyz__\n`,
    );
    expect(() => _buildConfig(yamlPath)).toThrow("configtree-loader: directory not found");
  });
});

// ---------------------------------------------------------------------------
// configtrees edge cases
// ---------------------------------------------------------------------------

describe("_buildConfig — configtrees edge cases", () => {
  it("ignores configtrees when it is a scalar (not an array)", () => {
    const yamlPath = writeYaml("app.yaml", "configtrees: not-an-array\n");
    const result = _buildConfig(yamlPath);
    expect(result).toEqual({ configtreeValues: {} });
  });

  it("skips non-string elements inside the configtrees array", () => {
    const dir = makeDir("db");
    writeFileSync(join(dir, "DB_HOST"), "localhost");
    // Mix of valid string path and non-string entries
    const yamlPath = writeYaml("app.yaml", `configtrees:\n  - ${dir}\n  - 123\n  - true\n`);
    const result = _buildConfig(yamlPath);
    expect(result.configtreeValues).toEqual({ DB_HOST: "localhost" });
  });
});

// ---------------------------------------------------------------------------
// Invalid YAML and bad top-level shapes
// ---------------------------------------------------------------------------

describe("_buildConfig — invalid or malformed yaml", () => {
  it("throws on invalid YAML syntax", () => {
    const yamlPath = writeYaml("app.yaml", "key: [unclosed bracket\n");
    expect(() => _buildConfig(yamlPath)).toThrow();
  });

  it("throws when yaml top-level value is a bare string (not a mapping)", () => {
    const yamlPath = writeYaml("app.yaml", "just a string\n");
    expect(() => _buildConfig(yamlPath)).toThrow(
      "configtree-loader: app.yaml must be a YAML mapping",
    );
  });

  it("throws when yaml top-level value is an array (not a mapping)", () => {
    const yamlPath = writeYaml("app.yaml", "- item1\n- item2\n");
    expect(() => _buildConfig(yamlPath)).toThrow(
      "configtree-loader: app.yaml must be a YAML mapping",
    );
  });
});
