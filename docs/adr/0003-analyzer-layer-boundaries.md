# 0003. Analyzer Layer Boundaries

Date: 2026-05-17

Status: Proposed

## Context

The DIY analyzer is organized like a small compiler pipeline:

- `app` resolves configuration and orchestrates analysis commands;
- `frontend` discovers, loads, parses, and scans source files;
- `middle-end` reasons over extracted facts and produces findings;
- `backend` formats analyzer results for humans or tooling.

That shape is useful, but some implementation boundaries now work against it.

The clearest issue is a cycle between `frontend` and `middle-end`.
`middle-end` depends on frontend module facts, which is expected, but
`frontend/module-loader.ts` also imports capability resolution from
`middle-end/capabilities.ts`. That makes capability resolution neither clearly part of
fact extraction nor clearly part of analysis.

`ModuleLoader` also carries too many responsibilities. It loads files, resolves imports,
parses source, records module facts, materializes function facts, invokes function-body
scanning, and participates in capability ID resolution. This makes it harder to change
the analyzer one phase at a time.

Some shared contracts also live inside layer-specific folders. Result types such as
`DiyAnalysis`, `DiyModuleGraph`, and `AnalyzeOptions` are consumed by `app` and
`backend`, but are defined under `middle-end`. Small cross-cutting helpers such as path
normalization similarly live in frontend modules even when backend code needs them.

## Decision

Keep the compiler-style analyzer architecture, but make the layer boundaries explicit
and acyclic.

The intended dependency direction is:

```text
app -> frontend -> middle-end -> backend
app -> backend
```

Layer-neutral model types and utilities may be imported by any layer:

```text
app
frontend
middle-end
backend
        -> model / shared utilities
```

`frontend` owns source discovery, module loading, import resolution, parsing, and
syntax-level fact extraction. It should produce facts that describe source code without
requiring whole-program capability reasoning.

`middle-end` owns semantic analysis over frontend facts. Capability ID resolution,
transitive dependency analysis, unused capability detection, and module graph analysis
belong here unless a narrower helper is purely syntax-level.

`backend` owns presentation. It may sort and format result objects, but it should not
depend on frontend modules for small utilities. Shared path formatting helpers should
move to a neutral utility module when multiple layers need them.

Shared API/result contracts should move out of layer folders. In particular,
`AnalyzeOptions`, `DiyAnalysis`, `DiyModuleGraph`, and related public result types should
live in a neutral model module rather than under `middle-end`.

`ModuleLoader` should be narrowed over time. It should remain responsible for loading
and resolving modules, but function scanning and semantic capability resolution should
move behind phase-specific functions that consume loaded module facts.

## Consequences

This does not change the public `@beff/diy` runtime API.

The analyzer can be refactored incrementally. The first useful step is removing the
`frontend` to `middle-end` import by moving capability ID resolution fully into
`middle-end` or by introducing a small neutral helper that does not depend on either
phase's concrete loader.

The codebase should become easier to review because each change can be described as a
frontend extraction change, middle-end analysis change, backend formatting change, or
app orchestration change.

Some files will move, and imports will churn during the refactor. Those moves should be
kept mechanical and separate from behavior changes where practical.

Tests should continue to focus on analyzer behavior through CLI or e2e fixtures. Layer
boundary changes should not require new behavior tests unless they change reported
findings, unsupported cases, graph output, or formatting.

## Alternatives Considered

Keeping the current structure was rejected because the existing cycle makes the pipeline
harder to reason about and encourages future analysis logic to leak into module loading.

Moving all analyzer code into one flat folder was rejected because it would remove useful
phase names without addressing the underlying responsibility split.

Creating many fine-grained packages was rejected for now because the problem is internal
module ownership, not package distribution. A small number of neutral model and utility
modules is enough.

Moving capability resolution entirely into `frontend` was rejected because resolving
capability sets across imported types is semantic analysis. The frontend should extract
the facts needed for that analysis, not own the analysis result.
