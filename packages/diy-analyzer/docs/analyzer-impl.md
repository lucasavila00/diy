# DIY Analyzer Implementation

This document maps the PL-level model in [analyzer.md](./analyzer.md) to the current
implementation. The analyzer is implemented as a small typed static-analysis pipeline:
load source, build a TypeScript checker program, extract capability facts from ASTs,
solve a finite dataflow problem, and project the result into diagnostics or graph output.

## Pipeline Control Flow

The public core entrypoint is
[`analyzeDiy`](../src/analysis/analyze.ts). It accepts a `DiySourceConfig` and
`AnalyzeOptions` from [`types.ts`](../src/model/types.ts):

```ts
type AnalyzeOptions = {
	readonly cwd?: string;
	readonly deadCodeAnalysis?: boolean;
	readonly graph?: boolean;
};
```

The options choose one of two analysis paths:

- syntax-only mode: `deadCodeAnalysis: false` builds a `NativeSyntaxProgram`, runs syntax
  rules and parse-error collection, applies suppressions, and finalizes the result;
- dead-code mode: the default path expands covered files, builds a checker-backed
  program, extracts capability facts, computes required capability sets, emits findings,
  and optionally attaches a module graph when `graph: true`.

`analyzeDiy` rejects `graph: true` with `deadCodeAnalysis: false` because graph output
depends on the same capability facts and fixed-point results as dead-code analysis.

The CLI in [`diy-cli/src/cli.ts`](../../diy-cli/src/cli.ts) always calls `analyzeDiy`.
For `--graph`, it asks analysis to include `graph: true`, prints any diagnostics first,
and prints the graph only when findings, violations, and unsupported cases are all empty.

## Program And Source State

Configured source files start as globs:

```ts
type DiySourceConfig = {
	readonly ignore?: readonly string[];
	readonly include: readonly string[];
};
```

[`expandSourceFiles`](../src/config/source-files.ts) resolves those globs into a sorted
absolute list. That list is the reportable surface: diagnostics are only reported for
covered files, even though the analyzer may load imported project files to resolve types
and forwarding targets.

[`checker-program.ts`](../src/analysis/checker-program.ts) builds two related program
records:

```ts
type NativeSyntaxProgram = {
	readonly api: API;
	readonly coveredFiles: readonly string[];
	readonly project: Project;
	readonly sourceFiles: readonly AnalyzedSourceFile[];
	readonly suppressions: { ... };
};

type CheckerAnalysisProgram = NativeSyntaxProgram & {
	readonly analyzedFunctions: readonly AnalyzedCapabilityFunction[];
};
```

`NativeSyntaxProgram` is enough for syntax rules. `CheckerAnalysisProgram` adds the
semantic capability-function facts needed for dataflow.

`AnalyzedSourceFile` is the analyzer's per-file wrapper around a tsgo `SourceFile`:

```ts
type AnalyzedSourceFile = {
	readonly filePath: string;
	readonly imports: ReadonlyMap<string, ImportBinding>;
	readonly lineStarts: () => readonly number[];
	readonly reportable: boolean;
	readonly sourceFile: SourceFile;
};
```

[`source-files.ts`](../src/analysis/source-files.ts) creates these records. It begins
with TypeScript root files plus the covered file set, walks local relative imports that
the tsgo program can resolve, skips declarations and external files, records DIY import
bindings, and marks each file as `reportable` only when it came from the configured
covered set.

## Function Abstraction

[`capability-functions.ts`](../src/analysis/capability-functions.ts) traverses every
`AnalyzedSourceFile` and selects function-like declarations whose first parameter
resolves to DIY `Capabilities<...>`. Each selected function becomes an
`AnalyzedCapabilityFunction` from [`native-types.ts`](../src/analysis/native-types.ts):

```ts
type AnalyzedCapabilityFunction = {
	readonly declaredCapabilityIds: ReadonlySet<string>;
	readonly directCapabilityIds: Set<string>;
	readonly forwardedUses: ForwardedCapabilityUse[];
	readonly propagatedCapabilitySources: Map<string | number, ReadonlySet<string>>;
	readonly providerChecks: CapabilityProviderCheck[];
	readonly unsupportedReasons: UnsupportedAnalysisReason[];
	// identity, source, location, parameter symbol, and naming fields omitted here
};
```

The key fields are the mutable abstract state for one function:

- `declaredCapabilityIds`: the finite capability label set recovered from the parameter
  type;
- `directCapabilityIds`: labels read directly by this function body;
- `forwardedUses`: forwarding constraints discovered at calls, expressed as the
  capability set required by the forwarded parameter type;
- `propagatedCapabilitySources`: local variables or assignment targets that point to a
  derived capability object;
- `providerChecks`: `Capabilities.extend(...)` calls that may redundantly provide
  capabilities already declared by the function;
- `unsupportedReasons`: proof blockers such as dynamic access, unresolved declarations,
  open bags, generic direct reads, and unresolved forwarding.

The collector also computes stable names and locations, handles namespace-qualified
names, keeps the parameter symbol for later identity checks, and sorts functions
deterministically by path, line, column, and name.

## Type Resolution Helpers

[`capability-types.ts`](../src/analysis/capability-types.ts) is the checker-facing layer.
It answers questions that syntax alone cannot answer:

- whether a type node or checker type is DIY `Capabilities<...>`;
- which public property names are capability IDs;
- whether a declaration is `Capabilities<never>`, a generic/opaque capability bag, or an
  open-ended bag;
- whether an expression refers to the imported DIY `Capabilities` runtime helper;
- what symbol an expression resolves to;
- what type a call argument, callee, or return expression has.

The main extraction rule is `capabilityIds(checker, type)`: get the checker properties
of the resolved capability type, then keep public property names. Internal synthetic
properties are filtered out.

The analyzer recognizes DIY `Capabilities` in two ways. Preferably, the resolved checker
type points back to DIY's `capabilities.ts` declaration. As a fallback for source shapes
where the checker type is not enough, it verifies that the type reference is imported
from `@beff/diy` or `@beff/diy/capabilities`, including namespace imports.

## AST Transfer Functions

[`usage-scanner.ts`](../src/analysis/usage-scanner.ts) scans each selected function body.
This is the concrete implementation of the local transfer function described in
`analyzer.md`.

The scanner walks the function's AST and updates the function state:

- `capabilities.reader` and `capabilities["reader"]` add `reader` to
  `directCapabilityIds`;
- bracket reads with non-static keys, optional access, or private identifiers become
  `dynamic-capability-access`;
- `const child = Capabilities.extend(capabilities, extra)` records `child` as a
  propagated capability source and records the extra provided labels;
- assignments from capability helper expressions do the same for the assignment target;
- calls that pass a capability source collect a forwarding constraint by comparing the
  argument to the callee parameter type at that call site;
- `Capabilities.extend(capabilities, extra)` also records a provider check so redundant
  extension can become a violation;
- nested functions with their own capability binding are treated as new analysis units,
  so their reads are not charged to the outer function.

A forwarded value is represented as:

```ts
type ForwardedExpression = {
	readonly provided: ReadonlySet<string>;
	readonly usesDeclared: boolean;
};
```

`provided` is the set of labels already supplied by a derived value. `usesDeclared`
tracks whether a helper expression depends on the original declared bag. When the callee
parameter is generic and the forwarded helper preserves the declared bag, the scanner can
fall back to the current function's declared set.

Forwarding edges are stored as:

```ts
type ForwardedCapabilityUse = {
	readonly provided: ReadonlySet<string>;
	readonly required: ReadonlySet<string>;
};
```

`required` is what the callee parameter type demands at this call site. It is not read
from the callee function body's computed requirements. `provided` is subtracted later
during fixed-point propagation so capabilities supplied by `extend`/`merge` are not
incorrectly charged to the caller.

## Dataflow And Result Projection

[`native-analysis.ts`](../src/analysis/native-analysis.ts) orchestrates the checker-backed
dead-code pass. It builds a `CheckerAnalysisProgram`, computes required capability sets,
collects findings, optionally builds a graph, collects unsupported cases and violations,
then closes the tsgo API.

The fixed-point solver is
[`computeRequiredCapabilityIds`](../src/analysis/results.ts). Its state is a map from
analyzed function ID to a grow-only required set:

```text
required[f] = direct[f]

while changed:
	for each function f:
		for each forwarding in f.forwardedUses:
			required[f] += forwarding.required - forwarding.provided
```

The implementation stores `forwarding.required` as a set already recovered from the call
site. It does not need to traverse a separate call graph during the fixed point. The loop
is monotone because required sets only gain labels, and it terminates because all labels
come from finite TypeScript property sets.

Result projection also lives in [`results.ts`](../src/analysis/results.ts):

- `collectUnusedFindings` reports `declared - required` for reportable functions, unless
  the parameter is `_capabilities` or the function has blocking unsupported reasons;
- `collectUnsupported` maps internal `UnsupportedAnalysisReason` values to user-facing
  unsupported diagnostics;
- `collectProviderViolations` reports redundant `Capabilities.extend` providers;
- `graphFunction` exposes each function's sorted direct and transitive sets for module
  graph output.

Module graph construction is in [`native-analysis.ts`](../src/analysis/native-analysis.ts).
It groups analyzed functions by file path, sorts functions using the same deterministic
function comparator, and attaches `DiyModuleGraph` to `DiyAnalysis` only when graph mode
requested it.

## Syntax Rules, Suppressions, And Finalization

[`native-syntax-rules.ts`](../src/analysis/native-syntax-rules.ts) runs independently of
dead-code findings. It reports parse errors as unsupported analysis and reports DIY
syntax violations such as:

- capability parameters not named `capabilities` or `_capabilities`;
- capability parameters not appearing first;
- non-DIY annotations on parameters named `capabilities`;
- intersected `Capabilities<A> & Capabilities<B>` bags;
- renamed imports from `@beff/diy`.

[`checker-program.ts`](../src/analysis/checker-program.ts) also collects
`// diy-ignore-next-line -- reason` directives from reportable files. After analysis,
[`diagnostic-suppressions.ts`](../src/analysis/diagnostic-suppressions.ts) removes
findings, violations, or unsupported cases on the target line and reports any unused
suppression as a violation.

[`finalize.ts`](../src/analysis/finalize.ts) performs the final deterministic sorting of
findings, unsupported cases, and violations. Graph output is attached after finalization
because it is already sorted while being built and is not part of the suppression model.

## Public Result Shapes

The public result contracts live in [`model/types.ts`](../src/model/types.ts):

- `DiyAnalysis` is the full analyzer result: covered files, findings, unsupported cases,
  violations, and optional `graph`;
- `DiyUnusedCapabilityFinding` carries declared, direct, transitive, and unused labels
  for one function;
- `DiyAnalyzerUnsupported` and `DiyAnalyzerViolation` carry source locations, reasons,
  and optional help notes;
- `DiyModuleGraph` groups `DiyModuleGraphFunction` records by file path.

The CLI reporting layer is outside the analyzer package. It formats diagnostics with
code frames and formats graphs as a tree where `direct` comes from direct reads and
`indirect` is computed as `transitive - direct`.
