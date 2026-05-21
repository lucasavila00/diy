# DIY Analyzer

The DIY analyzer is a static analysis for TypeScript programs that use DIY's
`Capabilities<...>` dependency-injection object. Its main question is:

> For each function that declares a capability bag, which declared capabilities are
> actually required by the function body or by functions it forwards the bag into?

The analyzer answers that question without running the program. It parses and type-checks
the project, extracts a small set of semantic facts from the AST, runs a graph/dataflow
calculation over those facts, and reports unused capability declarations or patterns it
cannot prove soundly.

Representative entrypoints are
[`analyze.ts`](../src/analysis/analyze.ts) and
[`native-analysis.ts`](../src/analysis/native-analysis.ts).

## What The Analyzer Models

At the PL level, a DIY capability bag is treated as a finite set of capability labels.
For example, `Capabilities<ReaderCapability | LoggerCapability>` is modeled as a set
like `{ reader, logger }`, where each label is the public property name exposed by the
TypeScript type.

The unit of analysis is a function whose first parameter resolves to DIY
`Capabilities<...>`. For example:

```ts
type AppCapability = ReaderCapability | LoggerCapability;

function handleRequest(capabilities: Capabilities<AppCapability>, name: string) {
	const value = capabilities.reader.read();
	writeLog(capabilities, value);
	return capabilities[name];
}
```

For that function, the analyzer records:

- `declared`: the capability labels allowed by the parameter type. In the example,
  `Capabilities<AppCapability>` gives the declared set `{ reader, logger }`.
- `direct`: labels read directly from that parameter. `capabilities.reader.read()`
  contributes `reader` to the direct set.
- `forwarded`: calls where the capability object, or a derived capability object, is
  passed onward to another function. `writeLog(capabilities, value)` creates a
  forwarding fact from `handleRequest` to the capability set required by the callee
  parameter at that call site.
- `unsupported`: syntax or type shapes where the analyzer cannot safely recover a finite
  capability set or a static access path. `capabilities[name]` is unsupported because
  `name` is a runtime value, so the analyzer cannot know which label was read.

The analyzer is intentionally conservative. If it can prove a capability is needed, it
keeps it. If it cannot prove enough about a function, it reports unsupported analysis
instead of guessing.

## How Source Becomes Facts

The frontend work starts from the configured `diy.json` include and ignore globs. Those
globs are expanded into absolute source paths, then loaded into a TypeScript checker
program through `tsgo`. The checker matters because capability information often lives
behind aliases, imports, unions, generic parameters, and helper calls that are not
reliable to interpret from syntax alone.

After the checker program exists, the analyzer traverses the TypeScript AST. During this
walk it identifies function-like nodes whose first parameter resolves to DIY
`Capabilities<...>`. That discovery pass builds the initial per-function abstract state:
the declared capability set, the parameter symbol, the function name/location, and
whether the function is reportable from the user's configured input set.

Function-body scanning is a second AST traversal over each discovered capability
function. Conceptually, this is a local transfer function:

- property or static string-index reads from the capability parameter add labels to
  `direct`;
- assignments like `const child = Capabilities.extend(capabilities, ...)` create local
  aliases for derived capability sources;
- calls that pass a capability source to another parameter create forwarding edges;
- helper calls such as `Capabilities.extend`, `merge`, and `override` update the set of
  labels considered already provided by the forwarded value;
- dynamic reads, unresolved declarations, and unresolved forwarding targets become
  unsupported-analysis facts.

Useful examples of this fact extraction live in
[`capability-functions.ts`](../src/analysis/capability-functions.ts) and
[`usage-scanner.ts`](../src/analysis/usage-scanner.ts).

## The Dataflow Problem

Once local facts are collected, unused-capability detection becomes a monotone dataflow
problem over the discovered functions.

Each function starts with:

```text
required(function) = direct(function)
```

Forwarding adds constraints. If function `f` forwards its capability object into a
callee parameter typed as requiring labels `{ a, b }`, then `f` also requires those
labels unless the forwarded value already provides them locally through an extension or
merge.

In simplified form:

```text
for each forwarding fact in f:
	required(f) += required_by_forwarded_parameter - provided_by_forwarded_value
```

The implementation repeats this propagation until no `required` set changes. Because
the sets only grow and the universe of capability labels is finite, the iteration reaches
a fixed point. That fixed point is the analyzer's transitive requirement graph:

- `direct` says what a function reads itself;
- `transitive` says what a function needs after adding the requirements of forwarded
  capability parameters;
- `unused = declared - transitive`.

The fixed-point computation and result projection are represented in
[`results.ts`](../src/analysis/results.ts).

## Graph Traversal And Boundaries

The module graph output is a view of the same analysis facts, grouped by source file. It
does not introduce a separate dependency model. It materializes each analyzed function
with its direct and transitive capability sets, then formatting turns those sets into the
CLI tree output.

The graph is not a general call graph, and the current graph output does not print call
edges. It materializes the per-function direct and transitive capability sets computed
from places where a DIY capability source is forwarded into a callable parameter whose
required capability type can be recovered. Ordinary calls without capability forwarding
are ignored because they do not change the dependency-injection proof.

The analyzer also treats nested functions carefully. If a nested function has its own
capability binding, the outer scan does not attribute that nested function's reads to the
outer function. This keeps lexical nesting from accidentally becoming capability
ownership.

## Diagnostics

The analyzer produces three user-facing categories:

- findings: declared capabilities that are not required by the fixed point;
- violations: DIY syntax or convention errors, such as invalid capability parameter
  placement or redundant provider extension;
- unsupported analysis: code shapes where the analyzer refuses to infer, such as dynamic
  capability access or unresolved forwarding.

Suppression comments are applied after analysis facts are produced and before final
sorting. Finalization keeps output deterministic by sorting paths, locations, function
names, and messages.

The CLI has three useful modes over the same core machinery:

- default analysis runs syntax checks plus dead-code capability analysis;
- `--no-dead-code-analysis` runs syntax checks without the fixed-point unused-capability
  pass;
- `--graph` asks the same dead-code analysis path to also materialize a module graph;
  the CLI prints diagnostics first and only prints the graph when there are no findings,
  violations, or unsupported cases.

## Why The Analyzer Is Shaped This Way

The important design choice is that DIY capability usage is modeled as typed dataflow,
not as string matching. TypeScript resolves which declarations are really
`Capabilities<...>`, AST traversal extracts local transfer facts, and the fixed-point
step computes the smallest capability set that satisfies all observed reads and
forwarding constraints.

That shape gives the analyzer two useful properties:

- it can follow ordinary TypeScript indirection, imports, aliases, and generic
  forwarding when the checker can prove the types;
- it has clear failure modes when the program uses runtime-dependent access patterns
  that do not have a static finite capability label.

The result is a narrow static analysis: it does not try to understand every effect in a
program, only the flow of DIY capability bags through well-typed function boundaries.
