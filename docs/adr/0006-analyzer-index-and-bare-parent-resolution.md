# 0006. Analyzer Should Resolve `index.ts` and Bare `..` Imports

Date: 2026-05-18

Status: Accepted

## Context

While porting a private application's dependency-injection layer to DIY
(`diy-cli@0.0.6`), the analyzer rejected capability parameters whose type was imported
through a folder's `index.ts` barrel — even though `tsc` and Node resolved the same
imports without complaint.

Two related failure shapes appeared:

### Shape A — workspace bare specifier ending at a folder

The capabilities module lived at a workspace path of the form
`packages/<core>/src/capabilities/index.ts`. Other packages imported it as:

```ts
import type { FooCapability } from "<core>/src/capabilities";
```

This is the standard Node + TypeScript form: the resolver finds `capabilities/` as a
folder and falls back to its `index.ts`. `tsc` accepts it. `diy-cli` reports the
specifier as unresolved at the capability parameter site:

```
src/feature/example.ts:11:32 unsupported analysis
> 11 |     capabilities: Capabilities<FooCapability>,
     |                                ^ unresolved import <core>/src/capabilities
```

Because the import is "unresolved" from the analyzer's perspective, every downstream
capability parameter whose type comes from that module is also marked
`unsupported analysis`. In the affected codebase, a single missing resolution produced
22 cascading diagnostics in unrelated files.

### Shape B — relative `.` / `..` ending at a folder

Inside the same package, a sibling file imported the barrel using `..` to climb one
directory:

```ts
// src/capabilities/build-foo.ts
import type { AppCapability } from "..";
```

This resolves to `src/capabilities/index.ts` for TypeScript via the standard
"folder fallback to index" rule, but the analyzer treats it as unresolved with the
same diagnostic cascade as Shape A. The `.` form (`from "."`) inside the folder
exhibits the same problem.

### Repro

A minimal reproduction is one folder with an `index.ts` barrel and one consumer:

```
fixture/
  src/
    capabilities/
      index.ts          # exports `type FooCapability = Capability<"foo", { ... }>;`
    feature/
      example.ts        # `import type { FooCapability } from "../capabilities";`
  diy.json
  package.json
  tsconfig.json
```

`tsc --noEmit` is clean. `diy-cli -p diy.json` prints
`unresolved import ../capabilities` on the consumer, and every
`Capabilities<FooCapability>` annotation downstream becomes `unsupported analysis`.

### Workaround

The user can flatten the barrel by promoting `src/capabilities/index.ts` to
`src/capabilities.ts` and rewriting internal relative imports from `..` / `.` to
`../capabilities` / `./capabilities`. With that, the analyzer resolves the modules and
the cascade clears. This is what the affected project ended up doing, but it forces
adopters to choose between idiomatic `index.ts` barrels and DIY analyzer compatibility.

## Decision

The analyzer's module resolver should match the TypeScript / Node resolution rule that
projects already rely on: when a specifier ends at a directory, fall back to that
directory's `index.{ts,tsx,js,jsx}` file. This should apply to:

- workspace bare specifiers ending at a directory;
- relative specifiers ending at a directory, including the special forms `"."` and
  `".."`.

If a specifier resolves under this rule, the analyzer should treat the resulting
capability types the same as it would for an explicit-file import — no
`unsupported analysis` cascade.

## Consequences

Codebases adopting DIY no longer have to choose between conventional `index.ts` barrels
and analyzer compatibility. Existing projects that already use the workaround
(promoting `index.ts` to a flat `<name>.ts`) remain valid; this change only adds
support for the additional shape.

The analyzer takes on a slightly larger surface to mirror — folder fallback is a real
piece of Node's resolution algorithm — but it is well-specified and shared with `tsc`,
so the cost is fixed.

## Alternatives Considered

Documenting "use flat files instead of `index.ts`" as a DIY-side rule was rejected
because it conflicts with an established TypeScript idiom and forces every adopter to
restructure folders the moment they import a capability type across packages.

Asking users to write fully-explicit specifiers (`"../capabilities/index"`) was
rejected for the same reason and because the analyzer already imposes other strict
shape rules; adding a new "no implicit index" rule on top of those would make the cost
of adoption visibly higher than the benefit per case.
