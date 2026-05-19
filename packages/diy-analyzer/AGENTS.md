# AGENTS.md

## Architecture

`@private/diy-analyzer` is a TypeScript analyzer for the DIY dependency-injection style used in this repo. The published `@beff/diy-cli` package is a thin binary wrapper around its bundled CLI. The pipeline is:

1. `src/core/program.ts` builds the parsed analyzer program from CLI inputs.
2. `src/core/module-loader.ts` parses files with `oxc-parser` and records shared imports, aliases, constants, and parse errors.
3. `src/lint/analyze.ts` coordinates the default lint pass; `src/lint/syntax-rules.ts` contains only syntax lint rules.
4. `src/dead-code/function-facts.ts` and `src/dead-code/function-scan.ts` collect effectful function metadata for dead-code analysis.
5. `src/dead-code/arena.ts` lowers dead-code metadata into indexed module/function arrays. Graph edges point to function indices, not object references or string IDs.
6. `src/dead-code/capabilities.ts` resolves declared capability IDs from `Capability<"...">`, unions, `Exclude`, local aliases, and imported aliases.
7. `src/dead-code/unused-capabilities.ts` computes transitive required capabilities and reports unused declared capabilities plus redundant `Capabilities.extend`.
8. `src/graph/module-graph.ts` builds the inspectable module/function/capability graph used by `--graph` and graph snapshots.
9. `src/backend/finalize.ts` sorts the combined analysis result, `src/backend/format.ts` formats findings, violations, and unsupported-analysis reports, and `src/backend/module-graph-format.ts` formats graph inspection output.
10. `src/app/cli.ts` wraps CLI parsing and dispatches directly to lint, dead-code, or graph entrypoints.

## Module Boundaries

- Put untyped Oxc AST guards, accessors, small DIY AST predicates, filesystem input expansion, parser/module loading, aliases, imports, and constants in `src/core/`.
- Put only default syntax lint behavior in `src/lint/`.
- Put effectful function body scanning, indexed arena construction, type-level capability resolution, and dead-code/reachability checks in `src/dead-code/`.
- Put layer-neutral public result contracts in `src/model/`, and shared cross-layer utilities in `src/shared/`.
- Graph passes should resolve loops through `FunctionIndex` / `ModuleIndex` values from `src/dead-code/arena.ts`; do not reintroduce string function IDs for graph traversal.
- Put analysis result finalization, sorting, code-frame human-output formatting, and graph-output formatting in `src/backend/`.
- Keep `src/app/cli.ts` as CLI dispatch only. It should not manually loop through modules, interpret parse errors, sort outputs, or contain rule details.

## Rule Authoring

- Prefer reporting a deterministic violation or unsupported-analysis reason over guessing.
- Keep output order stable by path, line, function/rule, and message.
- Reuse centralized AST helpers instead of open-coding node-shape checks in multiple files.
- Keep rule IDs stable once introduced; tests and model-facing output use them.
- Do not add performance-oriented complexity unless profiling shows the analyzer is too slow.

## Tests

- Analyzer behavior, syntax-rule failures, unused-capability failures, module graph behavior, config loading, and CLI errors should be covered through `e2e-tests/` so tests exercise the real CLI and `diy.json` loading path.
- Do not add `packages/diy-analyzer/test/` unit tests unless the behavior is a small internal edge case that cannot be validated through e2e.

## Validation

Run these from the repository root after analyzer changes:

- `pnpm --filter @private/diy-analyzer run typecheck`
- `pnpm run check`
