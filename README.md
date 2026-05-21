# DIY: TypeScript Dependency Injection for the Agentic Era

DIY organizes TypeScript dependencies with plain capability types:

- Readable function signatures.
- Agents use the CLI and TypeScript to fix missing or unneeded capabilities.
- No runtime DI framework, reflection, metadata scanning, or graph solving.

The tradeoff is manually maintained TypeScript DI annotations, checked by the CLI and updated by agents, in exchange for no runtime cost, no control-flow changes, and easy-to-read explicit code.

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

export type FsCapability = Capability<"fs", FsLike>;
export type ClockCapability = Capability<"clock", ClockLike>;
export type AppCapability = ClockCapability | FsCapability;
```

Use TypeScript unions to group multiple dependencies. Here, `AppCapability` means a
container may provide both clock and filesystem services.

### 3. Provide services

Build a `Capabilities` value from concrete service implementations:

```ts
import * as fs from "node:fs/promises";

import { Capabilities } from "@beff/diy/capabilities";
import type { AppCapability } from "./capabilities.ts";

const capabilities = Capabilities.create<AppCapability>({
	clock: { now: () => new Date() },
	fs,
});
```

### 4. Use capabilities

Accept `capabilities` as the first parameter of effectful functions and read services as plain object properties:

```ts
import type { Capabilities } from "@beff/diy/capabilities";
import type { ClockCapability, FsCapability } from "./capabilities.ts";

export async function readTimestampedConfig(
	capabilities: Capabilities<ClockCapability | FsCapability>,
	path: string,
): Promise<string> {
	const config = await capabilities.fs.readFile(path, "utf8");

	return `[${capabilities.clock.now().toISOString()}]\n${config}`;
}
```

Declare the narrowest union a function needs. Entry points can use broader aliases
such as `AppCapability`, while helper functions can request just
`ClockCapability | FsCapability` or a single capability.

### 5. Add analyzer config and scripts

Add a `diy.json` file that selects the source files to analyze:

```json
{
	"include": ["packages/**/*.ts", "packages/**/*.tsx"],
	"ignore": ["**/dist/**", "**/node_modules/**"]
}
```

Then add scripts that run `diy-cli` with that project file:

```json
{
	"scripts": {
		"diy:lint": "diy-cli -p diy.json",
		"diy:check": "diy-cli --dead-code -p diy.json",
		"diy:graph": "diy-cli --graph -p diy.json > diy-module-graph.txt"
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
`-- run
   +-- direct: clock
   `-- indirect: fs
```

## CLI Options

The `diy-cli` binary analyzes files matched by a required `diy.json` project file.

```shell
$ npx diy-cli -p diy.json
DIY analyzer passed: 42 files analyzed.
```

Run `--help` to print usage:

```shell
$ npx diy-cli --help
Usage: diy-cli [options]
```

Options:

- `-p, --project <path>`: Required path to `diy.json`.
- `--dead-code`: Run unused-capability and capability reachability analysis.
- `--graph`: Print a capability module graph instead of normal analyzer diagnostics.

`diy.json` fields:

- `include`: Required string array of glob patterns to analyze.
- `ignore`: Optional string array of glob patterns to skip.

## Lint Rules

By default, DIY runs a syntax lint pass. These rules keep capability-bearing
functions easy for people, TypeScript, and the analyzer to read.

Capability parameters must be the first parameter, and they must be named
`capabilities` or `_capabilities`:

```ts
import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;

// Allowed.
export function load(capabilities: Capabilities<ReaderCapability>, id: string): string {
	return capabilities.reader.read() + id;
}

// Allowed when the function intentionally requires no services.
export function loadStatic(_capabilities: Capabilities<never>): string {
	return "static";
}

// Not allowed: the capability parameter is second.
export function misplaced(id: string, capabilities: Capabilities<ReaderCapability>): string {
	return id + capabilities.reader.read();
}

// Not allowed: DIY capability parameters must use the conventional name.
export function renamed(deps: Capabilities<ReaderCapability>): string {
	return deps.reader.read();
}
```

Capability parameters may use direct `Capabilities<...>` annotations or aliases
that resolve to DIY `Capabilities<...>`:

```ts
// Allowed.
export function load(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities.reader.read();
}

// Also allowed.
type ReaderCaps = Capabilities<ReaderCapability>;

export function loadViaAlias(capabilities: ReaderCaps): string {
	return capabilities.reader.read();
}

// Allowed for callback/function-type parameters too.
type ReaderCallback = (capabilities: Capabilities<ReaderCapability>) => string;
```

If a parameter named `capabilities` or `_capabilities` has a type annotation, it
must resolve to DIY `Capabilities<...>`. This prevents unrelated values from
looking like DIY capability bags:

```ts
// Not allowed.
export function parse(capabilities: unknown): void {
	void capabilities;
}
```

Imports from `@beff/diy` and `@beff/diy/capabilities` must use the exported names
directly:

```ts
// Allowed.
import { Capabilities, type Capability } from "@beff/diy/capabilities";
import type { Capabilities as ExternalCapabilities } from "some-other-package";

// Not allowed for DIY imports.
import * as Diy from "@beff/diy";
import { Capabilities as CapabilityBag } from "@beff/diy";
import DiyDefault from "@beff/diy";
```

## Dead-Code Analysis

Run `diy-cli --dead-code -p diy.json` to check capability reachability. Dead-code
mode also runs the default lint rules.

A function's declared `Capabilities<...>` union is the complete list of
capability IDs that function is allowed to require. Every non-`never` ID must be
used directly or through an analyzed forwarded call. If a function intentionally
does not use services, name the parameter `_capabilities` and declare
`Capabilities<never>`.

```ts
import { Capabilities, type Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

// Allowed: `reader` is declared and read directly.
export function load(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities.reader.read();
}

// Allowed: bracket access with a static key is also a direct read.
export function loadByKey(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities["reader"].read();
}

const readerKey = "reader" as const;

// Allowed: const string keys are static enough to analyze.
export function loadByConstKey(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities[readerKey].read();
}

// Not allowed: `writer` is declared but never required.
export function overDeclared(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): string {
	return capabilities.reader.read();
}
```

Direct reads must be statically resolvable. Dynamic capability IDs are reported as
unsupported analysis instead of being guessed:

```ts
// Not allowed: the analyzer cannot prove which capability ID is read.
export function dynamicRead(capabilities: Capabilities<ReaderCapability>, id: string): unknown {
	return capabilities[id];
}

// Not allowed: optional chaining on the capability read is not analyzable.
export function optionalRead(capabilities: Capabilities<ReaderCapability>): unknown {
	return capabilities?.reader;
}
```

Passing the capability bag to another function is allowed. If that call requires
capabilities that the current function did not declare, TypeScript and the
analyzer will report the mismatch:

```ts
function needWriter(capabilities: Capabilities<WriterCapability>): void {
	capabilities.writer.write("ok");
}

// Allowed: `writer` is required transitively by `needWriter`.
export function save(capabilities: Capabilities<WriterCapability>): void {
	needWriter(capabilities);
}
```

Forwarded calls must have an analyzable callee. Calls through `any`, dynamic
registry lookups, or other unresolved call targets are reported as unsupported:

```ts
declare const dynamicRun: (...args: any[]) => void;

// Not allowed: the analyzer cannot inspect the target parameter type.
export function runDynamic(capabilities: Capabilities<ReaderCapability>): void {
	dynamicRun(capabilities);
}
```

`Capabilities.extend(...)`, `Capabilities.merge(...)`, and
`Capabilities.override(...)` preserve the original bag when their result is read,
returned, or forwarded. `extend` is for adding new IDs; adding an ID already
declared by the current function is reported as a redundant provider:

```ts
declare const writer: { write(value: string): void };

// Allowed: `writer` is added before forwarding to a function that needs it.
export function addWriter(capabilities: Capabilities<ReaderCapability>): void {
	const extended = Capabilities.extend(capabilities, { writer });
	needWriter(extended);
}

// Not allowed: this function already accepts `writer`.
export function redundantProvider(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	Capabilities.extend(capabilities, { writer });
}

// Allowed when replacement is intentional.
export function replaceWriter(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): Capabilities<ReaderCapability | WriterCapability> {
	return Capabilities.override(capabilities, { writer });
}
```

Open-ended bags cannot be checked for unused IDs. Use a concrete union for normal
effectful functions, or `Capabilities<never>` for functions that require no
services:

```ts
type AnyCapability = Capability<string, unknown>;

// Allowed with an explicit suppression when writing a framework pass-through.
// diy-ignore-next-line -- framework hook forwards any capability bag.
export function frameworkHook(
	capabilities: Capabilities<AnyCapability>,
	next: (capabilities: Capabilities<AnyCapability>) => void,
): void {
	next(capabilities);
}

// Allowed: explicitly empty.
export function pureBoundary(_capabilities: Capabilities<never>): void {}
```

Generic capability bags are allowed for framework-style pass-through helpers. If
one of these helpers needs to read from the bag directly, DIY intentionally bails
out instead of guessing which concrete IDs are allowed. This should be rare; add
a suppression when it is intentional:

```ts
type AnyCapability = Capability<string, unknown>;

// Allowed: pass-through only.
export function forwardGeneric<Allowed extends AnyCapability>(
	capabilities: Capabilities<Allowed>,
	next: (capabilities: Capabilities<Allowed>) => void,
): void {
	next(capabilities);
}

// Allowed with an explicit suppression when the generic direct read is intentional.
// diy-ignore-next-line -- framework helper reads from a generic bag by design.
export function readGeneric<Allowed extends ReaderCapability>(
	capabilities: Capabilities<Allowed>,
): string {
	return capabilities.reader.read();
}
```

Suppressions must include a reason after `--` and must sit on the line before the
diagnostic. Suppressions without a reason, or stale suppressions that do not hide
any diagnostic, are reported.

## Advanced Features

### Add capabilities locally

Use `Capabilities.extend(...)` to add services around a smaller dependency set:

```ts
import { Capabilities, type Capability } from "@beff/diy/capabilities";
import type { RequestContext } from "./context.ts";
import type { AppCapability } from "./deps.ts";

type ProgressLogger = {
	progress(text: string): Promise<void>;
};

type ProgressLoggerCapability = Capability<"progressLogger", ProgressLogger>;

export function createRequestCapabilities(
	capabilities: Capabilities<AppCapability>,
	context: RequestContext,
): Capabilities<AppCapability | ProgressLoggerCapability> {
	return Capabilities.extend(
		capabilities,
		Capabilities.create<ProgressLoggerCapability>({
			progressLogger: {
				async progress(text) {
					context.log(text);
				},
			},
		}),
	);
}
```

### Override services for tests

Use `Capabilities.override(...)` to replace services without changing the capability type:

```ts
import * as fs from "node:fs/promises";

import { Capabilities } from "@beff/diy/capabilities";
import type { AppCapability } from "./capabilities.ts";

const production = Capabilities.create<AppCapability>({
	clock: { now: () => new Date() },
	fs,
});

const testCapabilities = Capabilities.override(production, {
	clock: {
		now: () => new Date("2026-01-01T00:00:00.000Z"),
	},
});
```

### Merge capability containers

Use `Capabilities.merge(...)` to compose capability containers built by separate modules:

```ts
import * as fs from "node:fs/promises";

import { Capabilities, type Capability } from "@beff/diy/capabilities";

type FsCapability = Capability<"fs", typeof fs>;
type ClockCapability = Capability<"clock", { now(): Date }>;
type DatabaseCapability = Capability<"database", { query(sql: string): Promise<unknown[]> }>;

const nodeCapabilities = Capabilities.create<FsCapability | ClockCapability>({
	clock: { now: () => new Date() },
	fs,
});

const databaseCapabilities = Capabilities.create<DatabaseCapability>({
	database: {
		async query(_sql) {
			return [];
		},
	},
});

const appCapabilities = Capabilities.merge(nodeCapabilities, databaseCapabilities);
```
