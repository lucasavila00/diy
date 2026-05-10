# DIY: Typescript Dependency Injection for the Agentic Era

DIY organizes TypeScript dependencies with plain capability types:

- Readable function signatures.
- Agent-maintained CLI checks for stale, unused, redundant, or invalid capabilities.
- Clear dependency maps for safer code moves and feature changes.
- No runtime DI framework, reflection, metadata scanning, or graph solving.

## Getting Started

Get up and running with DIY in just a few simple steps:

### 1. Install

Install the runtime and analyzer packages from npm:

```shell
npm i @beff/diy @beff/diy-cli
```

### 2. Define capabilities

Create capability types for the services your code needs:

```ts
import type { Capability } from "@beff/diy/capabilities";
import type { PathLike, Stats } from "node:fs";

export type FsLike = {
	access(path: PathLike): Promise<void>;
	mkdir(path: PathLike, options: { recursive: true }): Promise<string | undefined>;
	readFile(path: PathLike, encoding: "utf8"): Promise<string>;
	stat(path: PathLike): Promise<Stats>;
	writeFile(path: PathLike, data: string, encoding: "utf8"): Promise<void>;
};

export type ClockLike = {
	now(): Date;
};

export type FsCapability = Capability<"core.fs", FsLike>;
export type ClockCapability = Capability<"core.clock", ClockLike>;
export type AppCapability = ClockCapability | FsCapability;
```

### 3. Provide services

Build a `Capabilities` value from concrete service implementations:

```ts
import * as fs from "node:fs/promises";

import { Capabilities } from "@beff/diy/capabilities";
import type { AppCapability } from "./capabilities.ts";

const capabilities = Capabilities.provide<AppCapability>({
	"core.clock": { now: () => new Date() },
	"core.fs": fs,
});
```

### 4. Use capabilities

Accept `capabilities` as the first parameter of effectful functions and request services with literal capability IDs:

```ts
import type { Capabilities } from "@beff/diy/capabilities";
import type { FsCapability } from "./capabilities.ts";

export async function readConfig(
	capabilities: Capabilities<FsCapability>,
	path: string,
): Promise<string> {
	const fs = capabilities.need("core.fs");

	return fs.readFile(path, "utf8");
}
```

### 5. Add analyzer scripts

Add scripts that run `diy-cli` over your package source:

```json
{
	"scripts": {
		"diy:check": "diy-cli packages",
		"diy:graph": "diy-cli --graph packages > diy-module-graph.txt"
	}
}
```

Then run the analyzer:

```shell
npm run diy:check
```

When the analyzer passes, it prints the number of files analyzed. When it finds a problem, it prints code-frame diagnostics for unsupported patterns, rule violations, unused capabilities, or redundant providers.

### 6. Generate a module graph

Use graph mode to inspect capability requirements by module and function:

```shell
npm run diy:graph
```

Example output:

```text
Module graph

packages/app/src/main.ts
`-- run: core.clock, core.fs
   `-- calls: readClock, readConfig
```

## CLI Options

The `diy-cli` binary analyzes TypeScript source files and directories.

```shell
$ npx diy-cli packages
DIY analyzer passed: 42 files analyzed.
```

Run without paths to print usage:

```shell
$ npx diy-cli
Usage: diy-cli [--graph] <paths...>
```

Options:

- `--graph`: Print a capability module graph instead of normal analyzer diagnostics.
- `<paths...>`: Files, directories, or glob patterns to analyze. DIY reads `.ts` and `.tsx` files and skips common generated or build output directories.

## Analyzer Rules

DIY's analyzer is intentionally strict so dependency flow stays easy to follow:

- Capabilities parameters must be named `capabilities`.
- Capabilities parameters must be typed as `Capabilities<...>`.
- Capabilities parameters must be the first function parameter.
- Capability method calls must be direct calls such as `capabilities.need(...)`, `capabilities.provide(...)`, or `capabilities.override(...)`.
- `capabilities.need(...)` must use a string literal capability ID.
- Capability methods must not be aliased, rebound, returned, or passed around.
- The `capabilities` value may be forwarded as the first argument to another effectful function.
- Declared capabilities that are not used directly or transitively are reported as unused.

## Advanced Features

### Add capabilities locally

Use `.provide(...)` to add services around a smaller dependency set:

```ts
import type { Capabilities, Capability } from "@beff/diy/capabilities";
import type { RequestContext } from "./context.ts";
import type { AppCapability } from "./deps.ts";

type ProgressLogger = {
	progress(text: string): Promise<void>;
};

type ProgressLoggerCapability = Capability<"app.progressLogger", ProgressLogger>;

export function createRequestCapabilities(
	capabilities: Capabilities<AppCapability>,
	context: RequestContext,
): Capabilities<AppCapability | ProgressLoggerCapability> {
	return capabilities.provide<ProgressLoggerCapability>({
		"app.progressLogger": {
			async progress(text) {
				context.log(text);
			},
		},
	});
}
```

### Override services for tests

Use `.override(...)` to replace services without changing the capability type:

```ts
import * as fs from "node:fs/promises";

import { Capabilities } from "@beff/diy/capabilities";
import type { AppCapability } from "./capabilities.ts";

const production = Capabilities.provide<AppCapability>({
	"core.clock": { now: () => new Date() },
	"core.fs": fs,
});

const testCapabilities = production.override({
	"core.clock": {
		now: () => new Date("2026-01-01T00:00:00.000Z"),
	},
});
```

### Merge capability containers

Use `Capabilities.merge(...)` to compose capability containers built by separate modules:

```ts
import * as fs from "node:fs/promises";

import { Capabilities, type Capability } from "@beff/diy/capabilities";

type FsCapability = Capability<"core.fs", typeof fs>;
type ClockCapability = Capability<"core.clock", { now(): Date }>;
type DatabaseCapability = Capability<"app.database", { query(sql: string): Promise<unknown[]> }>;

const nodeCapabilities = Capabilities.provide<FsCapability | ClockCapability>({
	"core.clock": { now: () => new Date() },
	"core.fs": fs,
});

const databaseCapabilities = Capabilities.provide<DatabaseCapability>({
	"app.database": {
		async query(_sql) {
			return [];
		},
	},
});

const appCapabilities = Capabilities.merge(nodeCapabilities, databaseCapabilities);
```
