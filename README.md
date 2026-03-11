# configtree-loader

Load Spring Boot-style configtree directories into nested config objects for Node.js, Bun, and Deno.

Reads a directory where each **filename = config key** and **file content = config value**, building a nested JSON object that mirrors the directory hierarchy.

## Install

```bash
npm install configtree-loader
# or
bun add configtree-loader
```

## Quick Start

Given this directory structure:

```
/etc/myapp/config/
  db/
    host          → "postgres.internal"
    port          → "5432"
    credentials/
      username    → "app_user"
      password    → "s3cr3t"
  cache/
    url           → "redis://localhost:6379"
```

```typescript
import { loadConfigTree, loadConfigTreeSync } from "configtree-loader";

// Async (recommended)
const config = await loadConfigTree("/etc/myapp/config");
// {
//   db: {
//     host: "postgres.internal",
//     port: "5432",
//     credentials: { username: "app_user", password: "s3cr3t" }
//   },
//   cache: { url: "redis://localhost:6379" }
// }

// Sync
const config = loadConfigTreeSync("/etc/myapp/config");
```

## Spring Boot Equivalent

This library mirrors Spring Boot's configtree feature:

```yaml
spring:
  config:
    import:
      - optional:configtree:/etc/config/db/
```

The `optional:` prefix maps to the `optional: true` option:

```typescript
// Returns {} instead of throwing if the directory doesn't exist
const config = await loadConfigTree("/etc/config/db", { optional: true });
```

## API

### `loadConfigTree(dirPath, options?): Promise<ConfigObject>`

Asynchronously loads a configtree directory. File reads are parallelized.

### `loadConfigTreeSync(dirPath, options?): ConfigObject`

Synchronously loads a configtree directory.

### Options

| Option     | Type      | Default | Description                                                  |
| ---------- | --------- | ------- | ------------------------------------------------------------ |
| `optional` | `boolean` | `false` | Return `{}` instead of throwing when `dirPath` doesn't exist |

### Types

```typescript
type ConfigValue = string | ConfigObject;
type ConfigObject = { [key: string]: ConfigValue };

interface LoadOptions {
  optional?: boolean;
}
```

## Behavior

- **Whitespace trimming**: File contents are trimmed of leading/trailing whitespace (including newlines). This is consistent with how Kubernetes secrets are mounted as files.
- **Nested objects**: Subdirectories produce nested objects in the result.
- **Symlinks**: Symlinks are silently ignored to avoid infinite loops.
- **Empty directories**: Returns `{}`.
- **Path conflicts**: Throws if a file and a directory share the same name at the same level.

## Common Use Cases

### Kubernetes Secrets

Kubernetes mounts secrets as files in a directory, making this library a natural fit:

```typescript
const secrets = await loadConfigTree("/var/run/secrets/myapp", { optional: true });
// { database_password: "...", api_key: "..." }
```

### Docker Secrets

```typescript
const secrets = await loadConfigTree("/run/secrets", { optional: true });
```

## License

MIT
