# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm workspace for DIY dependency-injection packages.

- `packages/diy/` contains the small public runtime package. Source files live in `src/`, build helpers in `script/`, and generated package output in `dist/`.
- `packages/diy-analyzer/` contains the TypeScript analyzer implementation. Its code is split into `src/frontend/`, `src/middle-end/`, `src/backend/`, and `src/app/`; analyzer e2e cases live in `e2e-tests/`.
- `packages/diy-cli/` contains the thin publishable CLI package. Its `bin/index.js` requires the generated CJS bundle copied from `packages/diy-analyzer/dist-cli/`.
- Root files (`package.json`, `pnpm-workspace.yaml`, `tsconfig.packages.json`) coordinate workspace builds and checks.

For analyzer internals, read `packages/diy-analyzer/AGENTS.md` before changing `packages/diy-analyzer/src/`.

## Build, Test, and Development Commands

Use pnpm 10, matching the root `packageManager` field.

- `pnpm install` installs workspace dependencies.
- `pnpm run typecheck` runs TypeScript checks in all packages.
- `pnpm run test` runs package tests where present.
- `pnpm run check` runs typecheck and tests.
- `pnpm run build` builds all packages and runs package fixup scripts.
Run the CI-equivalent sequence before broad changes: `pnpm run check && pnpm run build`.

## Coding Style & Naming Conventions

The codebase is TypeScript ESM. Keep imports explicit and include `.ts` extensions for local source imports, matching existing files. Use tabs for indentation, `camelCase` for functions and variables, `PascalCase` for exported types/classes, and descriptive kebab-case filenames such as `module-graph.ts`.

Do not commit generated `dist/` churn unless the change intentionally updates package output. Keep analyzer output deterministic by sorting paths, rules, and messages consistently.

## Testing Guidelines

Analyzer behavior is covered through `e2e-tests/` so tests exercise real CLI and `diy.json` loading paths.

Run focused analyzer checks with `pnpm --filter @beff/diy-analyzer run typecheck` and `pnpm run test:e2e`.

## Commit & Pull Request Guidelines

Git history uses short imperative commit subjects, for example `Add regular CI testing` and `Remove dead code`. Keep subjects concise and describe the behavior or maintenance change.

Pull requests should include a clear summary, commands run, linked issues when applicable, and screenshots or terminal output only when they clarify user-visible behavior. Mention snapshot or graph artifact updates explicitly.

## Security & Configuration Tips

Publishing uses `NPM_TOKEN` in GitHub Actions. Do not commit registry tokens, local `.env` files, or machine-specific paths. Prefer root workspace commands so package-local tooling and lockfile state stay consistent.
