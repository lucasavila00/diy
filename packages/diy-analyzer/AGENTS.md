# AGENTS.md

## Architecture

`@private/diy-analyzer` is a TypeScript analyzer for the DIY dependency-injection style used in this repo. The published `@beff/diy-cli` package is a thin binary wrapper around its bundled CLI. The pipeline is:

1. `src/core/source-files.ts` expands configured analyzer inputs.
2. `src/dead-code/checker-program.ts` loads tsgo projects and source files through `@typescript/native-preview/unstable/sync`.
3. `src/lint/analyze.ts` coordinates the default syntax lint pass using the shared native syntax rules.
4. `src/dead-code/` contains checker-backed dead-code and graph analysis.
5. `src/backend/finalize.ts` sorts the combined analysis result, `src/backend/format.ts` formats findings, violations, and unsupported-analysis reports, and `src/backend/module-graph-format.ts` formats graph inspection output.
6. `src/app/cli.ts` wraps CLI parsing and dispatches directly to lint, dead-code, or graph entrypoints.

## Module Boundaries

- Put filesystem input expansion in `src/core/`.
- Put only default syntax lint behavior in `src/lint/`.
- Put tsgo AST helpers, source loading, native syntax rules, and checker-backed dead-code analysis in `src/dead-code/`: `native-analysis.ts` should orchestrate, `checker-program.ts` and `source-files.ts` should load tsgo inputs, `native-syntax-rules.ts` should contain shared lint syntax rules, `capability-functions.ts` should collect functions whose first parameter resolves to DIY `Capabilities<...>`, `usage-scanner.ts` should scan function bodies, `capability-types.ts` should contain checker helpers, and `results.ts` should project diagnostics and graph output.
- Put layer-neutral public result contracts in `src/model/`, and shared cross-layer utilities in `src/shared/`.
- Graph passes should reuse checker-resolved function analysis from `src/dead-code/`; do not reintroduce the old AST-only arena.
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
