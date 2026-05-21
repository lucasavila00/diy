# AGENTS.md

## Architecture

`@beff/diy-analyzer` is a private TypeScript analyzer core for the DIY dependency-injection style used in this repo. The published `@beff/diy-cli` package owns the CLI source and bundles this analyzer core through the private `@private/diy-cli-builder` package. The pipeline is:

1. `src/core/config/source-files.ts` expands configured analyzer inputs.
2. `src/core/analysis/checker-program.ts` loads tsgo projects and source files through `@typescript/native-preview/unstable/sync`.
3. `src/core/analysis/lint.ts` coordinates the default syntax lint pass using the shared native syntax rules.
4. `src/core/analysis/` contains checker-backed dead-code, lint, and graph analysis.
5. `src/core/analysis/finalize.ts` sorts the combined analysis result.
6. `../diy-cli/src/cli.ts` wraps CLI parsing and dispatches directly to default dead-code, opt-out lint, or graph entrypoints.

## Module Boundaries

- Put filesystem input expansion in `src/core/config/`.
- Put tsgo AST helpers, source loading, native syntax rules, checker-backed dead-code analysis, default syntax lint behavior, and graph analysis in `src/core/analysis/`: `native-analysis.ts` should orchestrate, `checker-program.ts` and `source-files.ts` should load tsgo inputs, `native-syntax-rules.ts` should contain shared lint syntax rules, `capability-functions.ts` should collect functions whose first parameter resolves to DIY `Capabilities<...>`, `usage-scanner.ts` should scan function bodies, `capability-types.ts` should contain checker helpers, and `results.ts` should project diagnostics and graph output.
- Put layer-neutral public result contracts in `src/core/model/`, and shared cross-layer utilities in `src/core/shared/`.
- Graph passes should reuse checker-resolved function analysis from `src/core/analysis/`; do not reintroduce the old AST-only arena.
- Keep CLI parsing, project config loading, code-frame human-output formatting, and graph-output formatting in `../diy-cli/src/`.

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

- `pnpm --filter @beff/diy-analyzer run typecheck`
- `pnpm run check`
