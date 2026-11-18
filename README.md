# DIY: TypeScript Dependency Injection for the Agentic Era

DIY handles TypeScript dependencies using straightforward capability types:

* Functions explicitly declare what they need.
* Callers provide those capabilities.
* The type checker and CLI catch misconfigured wiring, unused capabilities, and leftover providers.
* Zero containers, decorators, reflection, or runtime magic.

## Agent-First

Dependency wiring with DIY is entirely local. If a function needs a new service, an AI agent just updates the function's capability type and tweaks the callers passing it in. You won't find any hidden container registries, decorator metadata, or obscure runtime graphs to dig through.

The tradeoff here is manual annotation. Sure, it adds a bit of visible source churn, but it gives agents explicit code to maintain and gives TypeScript (and the DIY CLI) hard rules to verify. If an agent forgets a caller, over-declares a dependency, or abandons a provider, the checks will point right to the exact line of code.

## Almost Algebraic Effects

When it comes to algebraic effects, DIY leans into explicit capability passing rather than implicit effect handling. While hidden magic might look cleaner at the call site, it's a pain to trace, type-check, analyze, and test in standard TypeScript.

* Combining DIY with Promises hits the sweet spot for JavaScript: the code requests capabilities, and the callers define how they work.
* Async operations just use standard await.
* Multi-shot continuations are undeniably cool, but they aren't exactly the biggest gap in everyday JavaScript development.
* While algebraic effects can obscure how things are wired, DIY keeps everything out in the open where humans, agents, TypeScript, and the analyzer can actually read it.

## Getting Started

Set up the runtime package and analyzer for a TypeScript project:

### 1. Install

Install the runtime and CLI packages from npm:

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

Use TypeScript unions to group multiple dependencies. Here, `AppCapability` means
the capability bag provides both clock and filesystem services.

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
		"diy:check": "diy-cli -p diy.json",
		"diy:graph": "diy-cli --graph -p diy.json > diy-module-graph.txt"
	}
}
```

Then run the analyzer:

```shell
npm run diy:check
```

When the analyzer passes, it prints the number of files analyzed. When it finds a problem, it prints one diagnostic per problem for unsupported patterns, rule violations, unused capabilities, or redundant providers. Diagnostics are plain text written for coding agents: a `path:line:column` location and the violated rule, then the reason and any known fix on indented lines.

```text
src/main.ts:7:8 unused capability
  Declares unused capability "writer".
  = help: remove "writer" from `Capabilities<...>`, or add a real `capabilities.writer` read if it is required
  = help: for known analyzer false positives, add `// diy-ignore-next-line -- reason` on the previous line
```

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
- `--graph`: Print a capability module graph instead of normal analyzer diagnostics.

`diy.json` fields:

- `include`: Required string array of glob patterns to analyze.
- `ignore`: Optional string array of glob patterns to skip.

## Lint Rules

DIY always runs a syntax lint pass alongside unused-capability analysis. These rules
keep capability-bearing functions easy for people, TypeScript, and the analyzer to
read.

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

DIY reads a function's capability requirements from its declaration, so the
`Capabilities<...>` annotation must be written in a form that is readable right
there. Exactly two forms are supported:

- `Capabilities<...>` written directly, with `Capabilities` imported by name from
  `@beff/diy` or `@beff/diy/capabilities`;
- a non-generic type alias of that, declared at the top level of the same file.

```ts
import type { Capabilities, Capability } from "@beff/diy";

// Allowed: direct annotation.
export function load(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities.reader.read();
}

// Allowed: non-generic alias declared at the top level of this file.
type ReaderCaps = Capabilities<ReaderCapability>;

export function loadViaAlias(capabilities: ReaderCaps): string {
	return capabilities.reader.read();
}

// Allowed for callback/function-type parameters too.
type ReaderCallback = (capabilities: Capabilities<ReaderCapability>) => string;
```

Every other way of spelling the annotation is unsupported on purpose. DIY favors
direct, readable code over abstraction, and the analyzer does not follow these
forms (see [ADR 0008](./docs/adr/0008-supported-capabilities-annotations.md)):

```ts
// Not allowed: alias imported from another module.
import type { ReaderCaps } from "./caps.ts";
export function load(capabilities: ReaderCaps): void {}

// Not allowed: `Capabilities` re-exported by another module (a barrel).
import type { Capabilities } from "./diy.ts";
export function load(capabilities: Capabilities<ReaderCapability>): void {}

// Not allowed: inline import type.
export function load(capabilities: import("@beff/diy").Capabilities<ReaderCapability>): void {}

// Not allowed: generic alias.
type Caps<Allowed extends Capability<string, unknown>> = Capabilities<Allowed>;
export function load(capabilities: Caps<ReaderCapability>): void {}

// Not allowed: alias declared inside a function, block, or namespace.
export function outer(): void {
	type LocalCaps = Capabilities<ReaderCapability>;
	const load = (capabilities: LocalCaps): string => capabilities.reader.read();
}
```

Each of these is reported as `invalid capabilities parameter` with the reason and
the fix:

```text
src/main.ts:8:34 invalid capabilities parameter
  `ReaderCaps` is imported from "./caps.ts". Types imported from other modules, including aliases and re-exports of `Capabilities`, are not supported as capabilities annotations: capability requirements must be readable at the declaration.
  = help: write `Capabilities<...>` directly, with `Capabilities` imported from `@beff/diy`, or declare a non-generic alias at the top level of this file, like `type AppCaps = Capabilities<AppCapability>`
```

The analyzer finds capability parameters by their supported annotation or by the
name `capabilities`/`_capabilities`. A parameter that has another name and an
unsupported annotation is not treated as a capability parameter: it is neither
analyzed nor reported.

Capability parameters require a function body. Overload signatures, `declare`
functions, and abstract methods have nothing the analyzer can check, so a
`Capabilities<...>` parameter on them is reported. Declare capabilities on the
implementation instead:

```ts
// Not allowed: overload signatures without a body.
export function load(capabilities: Capabilities<ReaderCapability>, id: string): string;
export function load(capabilities: Capabilities<ReaderCapability>, id: number): string;
export function load(capabilities: Capabilities<ReaderCapability>, id: string | number): string {
	return capabilities.reader.read() + String(id);
}

// Not allowed: abstract methods have no body.
export abstract class Job {
	abstract run(capabilities: Capabilities<ReaderCapability>): void;
}
```

Constructors cannot take capabilities. A constructor would store the capabilities
bag on the object, which hides which services each method uses, and constructors
cannot be `async`. Take capabilities in a function instead:

```ts
// Not allowed.
export class Service {
	constructor(capabilities: Capabilities<ReaderCapability>) {
		this.value = capabilities.reader.read();
	}
}

// Allowed.
export async function createService(capabilities: Capabilities<ReaderCapability>): Promise<string> {
	return capabilities.reader.read();
}
```

If a parameter named `capabilities` or `_capabilities` has a type annotation, it
must use one of the supported `Capabilities<...>` forms above. This prevents
unrelated values from looking like DIY capability bags:

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

Read capability services inline at each use site. Local aliases and destructuring
of `capabilities` are rejected:

```ts
// Allowed.
const now = capabilities.clock.now();
const logger = createLabeledLogger(capabilities.progressLogger);

// Not allowed.
const clock = capabilities.clock;
const clock = capabilities["clock"];
const { clock } = capabilities;
```

## Dead-Code Analysis

Run `diy-cli -p diy.json` to check capability reachability. Dead-code analysis is
enabled by default and also runs the lint rules.

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
capabilities that the current function did not declare, TypeScript reports the
mismatch as a type error (`Capabilities<ReaderCapability>` is not assignable to
`Capabilities<WriterCapability>`). The analyzer does not repeat this check, so run
`tsc` alongside `diy-cli`. The analyzer uses forwarded calls to decide which declared
capabilities are used:

```ts
function needWriter(capabilities: Capabilities<WriterCapability>): void {
	capabilities.writer.write("ok");
}

function needReader(capabilities: Capabilities<ReaderCapability>): void {
	capabilities.reader.read();
}

// Allowed: `writer` is required transitively by `needWriter`.
export function save(capabilities: Capabilities<WriterCapability>): void {
	needWriter(capabilities);
}
```

Pass the capability bag only to parameters typed `Capabilities<...>`. The analyzer
does not look inside other parameter types, so passing the bag to `any`,
`unknown`, a structural object type, a union such as
`Capabilities<ReaderCapability> | undefined`, or a library call such as
`Object.keys(capabilities)` is reported as unsupported:

```ts
declare const dynamicRun: (...args: any[]) => void;

function structural(deps: { reader: { read(): string } }): string {
	return deps.reader.read();
}

function optional(capabilities: Capabilities<ReaderCapability> | undefined): string {
	return capabilities == null ? "" : capabilities.reader.read();
}

// Not allowed: none of these parameters is typed `Capabilities<...>`.
export function notAnalyzable(capabilities: Capabilities<ReaderCapability>): void {
	dynamicRun(capabilities);
	structural(capabilities);
	optional(capabilities);
	Object.keys(capabilities);
}
```

Each of these calls reports, at the argument's location:

```text
src/main.ts:LINE:COLUMN unsupported analysis
  capabilities bag passed to a parameter not typed `Capabilities<...>`; the analyzer cannot see which services it uses
  = help: pass `capabilities` only to functions whose parameter is typed `Capabilities<...>`; read the services you need instead of inspecting the bag
  = help: for known analyzer false positives, add `// diy-ignore-next-line -- reason` on the previous line
```

Type the callee's parameter as `Capabilities<...>`, or read the services you need
directly instead of inspecting the bag.

Pass the capability bag to the callee directly, as its own argument. The analyzer
does not follow the bag through other expressions, so these are reported as
unsupported analysis:

- a conditional expression: `run(flag ? capabilities : other)`;
- `??` or `||`: `run(fallback ?? capabilities)`;
- an object spread: `run({ ...capabilities })`;
- a wrapper object: `const context = { capabilities }` or `{ bag: capabilities }`;
- a function return: `const pick = () => capabilities` or `return capabilities`.

`run.call(thisArg, capabilities)` and `run.bind(thisArg, capabilities)` still pass the bag
as a direct argument, so they are supported and analyzed like `run(capabilities)`.

```ts
// Not allowed: the bag is copied with a spread.
export function loadCopy(capabilities: Capabilities<ReaderCapability>): void {
	needReader({ ...capabilities });
}
```

```text
src/main.ts:3:18 unsupported analysis
  capabilities bag copied with an object spread; the analyzer cannot tell which capabilities are used
  = help: pass `capabilities` directly as an argument: `run(capabilities)`; use `Capabilities.extend(capabilities, ...)` to add services
  = help: for known analyzer false positives, add `// diy-ignore-next-line -- reason` on the previous line
```

### Capability helpers and unused parameters

`Capabilities.extend(...)`, `Capabilities.merge(...)`, and
`Capabilities.override(...)` can create a new capability bag from an existing
one. The analyzer looks through those helper calls when the new bag is passed to
another function.

The important rule is that locally created or replaced services do not make the
original parameter service count as used.

Use `extend` when this function creates a service before calling another
function. The new service does not need to appear in this function's parameter
type:

```ts
declare const writer: { write(value: string): void };

// Allowed: `writer` is created here, then passed to `needWriter`.
export function addWriter(_capabilities: Capabilities<never>): void {
	const extended = Capabilities.extend(
		_capabilities,
		Capabilities.create<WriterCapability>({ writer }),
	);
	needWriter(extended);
}

// Not allowed: this function already receives `writer`, so extending with
// another `writer` provider is redundant.
export function redundantProvider(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	const extended = Capabilities.extend(
		capabilities,
		Capabilities.create<WriterCapability>({ writer }),
	);
	needReader(extended);
}
```

Use `override` when this function replaces a service. If the function only
passes the replacement onward, the original service from the parameter was not
used:

```ts
declare const writer: { write(value: string): void };

// Not allowed: the original `writer` is never used; it is replaced before
// anything reads it.
export function replaceWriter(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	const replaced = Capabilities.override(capabilities, { writer });
	needWriter(replaced);
}

// Allowed: this function reads the original `writer` before replacing it.
export function auditAndReplaceWriter(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	capabilities.writer.write("audit");
	const replaced = Capabilities.override(capabilities, { writer });
	needWriter(replaced);
}
```

The helpers combine their arguments from left to right, like object spread
(`{ ...a, ...b }`). When two arguments give the same service, the later argument
wins.

- A later argument replaces a service only if it always gives that service.
- An optional key (for example, a key of a `Partial<...>` value) can be missing.
  It does not replace the service.
- The `capabilities` parameter can be in any argument position.
- The `capabilities` parameter can be inside a nested helper call.

```ts
declare function needBoth(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void;
declare const overrides: Partial<Capabilities<ReaderCapability | WriterCapability>>;
declare const writerCapabilities: Capabilities<WriterCapability>;

// Allowed: `overrides` may leave out either key, so the original `reader` and
// `writer` can still reach `needBoth`.
export function overrideSome(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	needBoth(Capabilities.override(capabilities, overrides));
}

// Allowed: `reader` comes from the parameter, `writer` from `writerCapabilities`.
export function readerFromParameter(capabilities: Capabilities<ReaderCapability>): void {
	needBoth(Capabilities.merge(writerCapabilities, capabilities));
}
```

Returning a capability bag also does not use the services inside it:

```ts
// Not allowed: `reader` is never read or passed to a function that needs it.
export function onlyReturn(
	capabilities: Capabilities<ReaderCapability>,
): Capabilities<ReaderCapability> {
	return Capabilities.merge(capabilities);
}
```

If a function only returns `Capabilities.merge(...)`, `Capabilities.extend(...)`,
or `Capabilities.override(...)`, do not declare services that the function itself
does not read or pass to a function that needs them.

Open-ended bags cannot be checked for unused IDs. Use a concrete union for normal
effectful functions, or `Capabilities<never>` for functions that require no
services:

```ts
type AnyCapability = Capability<string, unknown>;

// Not allowed for regular capability parameters.
export function openBag(capabilities: Capabilities<AnyCapability>): void {
	void capabilities;
}

// Allowed: explicitly empty.
export function pureBoundary(_capabilities: Capabilities<never>): void {}
```

`Capability<string, unknown>` is intended for generic bounds in framework-style
pass-through helpers, not as the declared bag for a regular function. If one of
these helpers needs to read from the bag directly, DIY intentionally bails out
instead of guessing which concrete IDs are allowed. This should be rare; add a
suppression when it is intentional:

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

## Capability Helpers

### Extend capabilities locally

Use `Capabilities.extend(...)` to add services around a smaller dependency set.
Build the added services with `Capabilities.create<YourCapability>(...)`. A plain
object literal such as `{ progressLogger }` is a type error: TypeScript cannot infer
capability IDs from it, and the result would otherwise pass as any `Capabilities<...>`.

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

Use `Capabilities.override(...)` to replace services without changing the capability type.
Pass only the services you replace; each one must be a real service, so `{ clock: undefined }` is a type error:

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

Use `Capabilities.merge(...)` to compose capability containers built by separate modules.
Like `extend`, every bag must have a capability type, so build each one with
`Capabilities.create<YourCapability>(...)`:

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

When two containers give the same service, the later container wins. `extend` and
`override` use the same rule.
