# configtree-loader

Load Spring Boot-style configtree directories into a flat config object for Node.js, Bun, and Deno.

Reads a directory where each **filename = config key** and **file content = config value**, returning a flat `Record<string, string>`. Subdirectories are ignored.

## Install

```bash
npm install configtree-loader
# or
bun add configtree-loader
```

## Quick Start

Given this directory structure:

```
/etc/config/db/
  DATABASE_HOST      → "postgres.internal"
  DATABASE_PORT      → "5432"
  DATABASE_USERNAME  → "app_user"
  DATABASE_PASSWORD  → "s3cr3t"
```

```typescript
import { loadConfigTree, loadConfigTreeSync } from "configtree-loader";

// Async (recommended)
const config = await loadConfigTree("/etc/config/db");
// {
//   DATABASE_HOST: "postgres.internal",
//   DATABASE_PORT: "5432",
//   DATABASE_USERNAME: "app_user",
//   DATABASE_PASSWORD: "s3cr3t"
// }

// Sync
const config = loadConfigTreeSync("/etc/config/db");
```

## Multiple Directories

Pass an array of paths to merge multiple configtree directories into one object. When the same key exists in multiple directories, the **last one wins**.

```typescript
// Mirrors multiple Spring Boot configtree imports:
// spring.config.import:
//   - optional:configtree:/etc/config/db/
//   - optional:configtree:/etc/config/redis/
//   - optional:configtree:/etc/config/overrides/

const config = await loadConfigTree(
  ["/etc/config/db", "/etc/config/redis", "/etc/config/overrides"],
  { optional: true },
);
```

## Spring Boot Equivalent

This library mirrors Spring Boot's configtree feature:

```yaml
spring:
  config:
    import:
      - optional:configtree:/etc/config/db/
      - optional:configtree:/etc/config/kafka/
```

The `optional:` prefix maps to the `optional: true` option:

```typescript
// Returns {} instead of throwing if the directory doesn't exist
const config = await loadConfigTree("/etc/config/db", { optional: true });
```

## API

### `loadConfigTree(dirPath, options?): Promise<ConfigObject>`

Asynchronously loads one or more configtree directories. File reads within each directory are parallelized.

### `loadConfigTreeSync(dirPath, options?): ConfigObject`

Synchronously loads one or more configtree directories.

### Parameters

| Parameter | Type                 | Description                    |
| --------- | -------------------- | ------------------------------ |
| `dirPath` | `string \| string[]` | Path or array of paths to load |
| `options` | `LoadOptions`        | Optional settings (see below)  |

### Options

| Option     | Type      | Default | Description                                                    |
| ---------- | --------- | ------- | -------------------------------------------------------------- |
| `optional` | `boolean` | `false` | Return `{}` instead of throwing when a directory doesn't exist |

### Types

```typescript
type ConfigObject = Record<string, string>;

interface LoadOptions {
  optional?: boolean;
}
```

## Behavior

- **Flat output**: All values are strings. Subdirectories are ignored.
- **Whitespace trimming**: File contents are trimmed of leading/trailing whitespace and newlines — consistent with how Kubernetes secrets are mounted.
- **Last-writer-wins**: When loading an array of paths, later directories overwrite earlier ones for the same key.
- **Empty directories**: Returns `{}`.
- **Symlinks**: Symlinks are silently ignored.

## Common Use Cases

### Kubernetes Secrets

Kubernetes mounts secrets as files in a directory, making this library a natural fit:

```typescript
const secrets = await loadConfigTree("/var/run/secrets/myapp", { optional: true });
// { DATABASE_PASSWORD: "...", API_KEY: "..." }
```

### Docker Secrets

```typescript
const secrets = await loadConfigTree("/run/secrets", { optional: true });
```

### Merging Multiple Secret Mounts

```typescript
const config = await loadConfigTree(["/etc/config/db", "/etc/config/kafka", "/etc/config/redis"], {
  optional: true,
});
```

## `config` Singleton (v0.3.0+)

`configtree-loader` ships a ready-to-use `config` singleton that combines a YAML config file with one or more configtree directories in a single import.

### How it works

On import, `config` reads a YAML file (default: `config/app.yaml` relative to `process.cwd()`), merges any configtree directories listed under the `configtrees` key, and exposes the result as an `AppConfig` object.

```typescript
import { config } from "configtree-loader";

console.log(config.configtreeValues); // merged key→value pairs from all configtree dirs
console.log(config.someYamlKey); // any other top-level key from app.yaml
```

### `config/app.yaml` format

```yaml
# Arbitrary top-level keys are passed through as-is
environment: production
region: us-east-1

# configtrees is the special key: a list of directories to load
configtrees:
  - /etc/config/db
  - /etc/config/kafka
```

The directories listed under `configtrees` are loaded with `loadConfigTreeSync` and merged into `configtreeValues`. Later entries overwrite earlier ones for the same key. The `configtrees` key itself is stripped from the final object.

### `AppConfig` type

```typescript
interface AppConfig {
  /** Merged key→value pairs loaded from all configured configtree directories. */
  configtreeValues: Record<string, string>;
  /** All other top-level keys from app.yaml. */
  [key: string]: unknown;
}
```

### Default file location and `APP_CONFIG_FILE`

By default the singleton reads `config/app.yaml` relative to `process.cwd()`. Override this at runtime with the `APP_CONFIG_FILE` environment variable:

```bash
APP_CONFIG_FILE=/path/to/custom.yaml node dist/server.js
```

If the file is missing (ENOENT), `config` silently returns `{ configtreeValues: {} }` — no exception is thrown.

### Side-effect-on-import and test environments

Because `config` is evaluated at import time, point `APP_CONFIG_FILE` to a fixture before importing in tests:

```typescript
// In your test setup or at the top of the test file (before importing config)
process.env["APP_CONFIG_FILE"] = "/path/to/test-config.yaml";

const { config } = await import("configtree-loader");
```

Or use a minimal fixture file that contains only what your tests need:

```yaml
# test/fixtures/app.yaml
configtrees: []
```

## License

MIT
