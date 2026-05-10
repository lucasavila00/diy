# AGENTS.md

## Architecture

`@q/diy-analyzer` is a TypeScript analyzer for the DIY dependency-injection style used in this repo. The pipeline is:

1. `src/frontend/program.ts` builds the analyzer program from CLI inputs.
2. `src/frontend/module-loader.ts` parses files with `oxc-parser`, records imports, aliases, and function nodes, then materializes effectful function metadata.
3. `src/frontend/analyze.ts` reports parser unsupported items and local syntax-rule violations.
4. `src/middle-end/arena.ts` lowers frontend module metadata into indexed module/function arrays. Middle-end graph edges point to function indices, not object references or string IDs.
5. `src/middle-end/analyze.ts` runs middle-end analysis passes.
6. `src/middle-end/capabilities.ts` resolves declared capability IDs from `Capability<"...">`, unions, `Exclude`, local aliases, and imported aliases.
7. `src/middle-end/unused-capabilities.ts` computes transitive required capabilities and reports unused declared capabilities plus redundant `capabilities.provide`.
8. `src/middle-end/module-graph.ts` builds the inspectable module/function/capability graph used by `--graph` and graph snapshots.
9. `src/backend/finalize.ts` sorts the combined analysis result, `src/backend/format.ts` formats findings, violations, and unsupported-analysis reports, and `src/backend/module-graph-format.ts` formats graph inspection output.
10. `src/app/analyze.ts` only coordinates the normal frontend, middle-end, and backend lint pipeline; `src/app/module-graph.ts` coordinates graph inspection; `src/app/cli.ts` wraps both for command-line use.

## Module Boundaries

- Put untyped Oxc AST guards, accessors, small DIY AST predicates, filesystem input expansion, parser/module graph behavior, effectful function body scanning, and local syntactic policy checks in `src/frontend/`.
- Put indexed arena construction, type-level capability resolution, semantic authority checks, and shared analyzer result types in `src/middle-end/`.
- Middle-end graph passes should resolve loops through `FunctionIndex` / `ModuleIndex` values from `src/middle-end/arena.ts`; do not reintroduce string function IDs for graph traversal.
- Put analysis result finalization, sorting, code-frame human-output formatting, and graph-output formatting in `src/backend/`.
- Keep `src/app/analyze.ts` as a thin full-pipeline coordinator. It should not manually loop through modules, interpret parse errors, sort outputs, or contain rule details.

## Rule Authoring

- Prefer reporting a deterministic violation or unsupported-analysis reason over guessing.
- Keep output order stable by path, line, function/rule, and message.
- Reuse centralized AST helpers instead of open-coding node-shape checks in multiple files.
- Keep rule IDs stable once introduced; tests and model-facing output use them.
- Do not add performance-oriented complexity unless profiling shows the analyzer is too slow.

## Tests

- Shared fixtures belong in `test/helpers.ts`.
- Unused capability and transitive capability behavior belongs in `test/unused-capabilities.test.ts`; use `toMatchInlineSnapshot` with a stable normalized analysis string.
- Capabilities parameter/call/escape/alias policy belongs in `test/syntax-rules.test.ts`; use `assertNoErrors` for passing examples and `assertHasError` with `toMatchFileSnapshot` files under `test/__snapshots__/syntax-rules/` for failing examples.
- Formatter and human-output contracts belong in `test/format.test.ts`; use `toMatchFileSnapshot` files under `test/__snapshots__/format/`.
- Module graph inspection behavior belongs in `test/module-graph.test.ts`; use record-shaped file fixtures plus `toMatchFileSnapshot` files under `test/__snapshots__/module-graph/`.
- The repo-wide graph artifact is `diy-module-graph.txt`; refresh it from the repo root with `pnpm run diy:graph`.
- Test behavior through public analyzer exports unless a small helper is deliberately made public.
- Snapshot output must not include random temp directory names or absolute fixture paths. Prefer serialized formatter output with a fixture `cwd`, or normalize paths to fixture-relative values before snapshotting structured analysis.
- Use `pnpm --filter @q/diy-analyzer run test-fix` only when intentionally updating snapshots.

## Validation

Run these from the repository root after analyzer changes:

- `pnpm --filter @q/diy-analyzer run test`
- `pnpm --filter @q/diy-analyzer run typecheck`
- `pnpm run diy:check`
- `pnpm run check`
