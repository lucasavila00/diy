# 0008. Supported Capabilities Annotations

Date: 2026-11-18

Status: Accepted

## Context

The analyzer decides that a parameter is a DIY capability bag by reading its type
annotation syntactically, one file at a time. The README described the accepted forms
loosely as "direct `Capabilities<...>` annotations or aliases that resolve to DIY
`Capabilities<...>`". TypeScript can resolve many more spellings than the analyzer
followed, so the same gap kept being reported as a bug:

- an alias imported from another module, and `Capabilities` re-exported through a local
  barrel, were rejected with a vague "must resolve to DIY `Capabilities<...>`" message
  ([#15](https://github.com/lucasavila00/diy/issues/15));
- `import("@beff/diy").Capabilities<...>` was rejected the same way (#15);
- a function-local alias was read as if it were a top-level alias of the same name, so it
  changed how an unrelated top-level type was interpreted (#15);
- a generic alias such as `type Caps<T> = Capabilities<T>` made concrete uses look
  generic and produced a false "generic capabilities parameter reads services directly"
  ([#24](https://github.com/lucasavila00/diy/issues/24)).

A checker-based change that supported all of these was written and rejected. DIY
deliberately favors direct, readable code over abstraction: a function's capability
requirements should be readable at its declaration site, by a person or an agent, without
opening another module or expanding type parameters. The same reasoning is behind ADR
0002, which rejects service aliases in function bodies.

## Decision

A capabilities annotation is supported in exactly two forms:

1. `Capabilities<...>` written directly, where `Capabilities` is imported by name from
   `@beff/diy` or `@beff/diy/capabilities`;
2. a non-generic type alias declared at the top level of the same file whose body is form
   1 or another such alias.

```ts
import type { Capabilities } from "@beff/diy";

type ReaderCaps = Capabilities<ReaderCapability>;

export function load(capabilities: Capabilities<ReaderCapability>): void {}
export function loadViaAlias(capabilities: ReaderCaps): void {}
```

Same-file aliases stay supported because they were already documented and used, the
declaration is at most one jump away inside the file being read, and following them is a
single map lookup.

Every other form is unsupported and will not be taught to the analyzer:

- an alias imported from another module: `import type { ReaderCaps } from "./caps.ts"`;
- `Capabilities` imported from anything but DIY, such as a barrel re-export:
  `import type { Capabilities } from "./diy.ts"`;
- an inline import type: `import("@beff/diy").Capabilities<ReaderCapability>`;
- a generic alias: `type Caps<T> = Capabilities<T>`;
- an alias declared inside a function, block, or namespace.

When a parameter named `capabilities` or `_capabilities` is annotated with one of these
forms, the analyzer reports `invalid capabilities parameter`, names the form, says why
(capability requirements must be readable at the declaration), and gives the fix:

```text
src/main.ts:18:33 invalid capabilities parameter
  Generic type alias `Caps` is not supported as a capabilities annotation: capability requirements must be readable at the declaration, not passed through type parameters.
  = help: write `Capabilities<...>` directly, with `Capabilities` imported from `@beff/diy`, or declare a non-generic alias at the top level of this file, like `type AppCaps = Capabilities<AppCapability>`
```

Only top-level aliases are read. A nested alias never changes how a top-level type of the
same name is interpreted.

This restricts only the annotation of the capabilities parameter. The capability types
inside `Capabilities<...>` are still resolved by the TypeScript checker, so
`Capabilities<AppCapability>` may use capability types and unions imported from anywhere.

## Consequences

- The supported set is small enough to state in the README and to check with syntax the
  reader can follow: the file's imports and its top-level type aliases.
- Reports asking the analyzer to follow imported aliases, barrels, inline import types,
  generic aliases, or nested aliases are not bugs. They are this decision.
- Shared `type AppCaps = Capabilities<...>` aliases cannot be exported from one module and
  used as parameter annotations in another. Export the capability union instead
  (`type AppCapability = A | B`) and write `Capabilities<AppCapability>` at each
  declaration.
- The analyzer identifies capability parameters by a supported annotation or by the name
  `capabilities`/`_capabilities`. A parameter with another name and an unsupported
  annotation (for example `deps: ImportedCaps`) is not recognized as a capability
  parameter: it is neither analyzed nor reported. Catching it would require asking the
  checker about every parameter of every function, which this decision avoids.

## Alternatives Considered

- Resolve annotations through the checker so every spelling TypeScript accepts works.
  Rejected: it removes the readability guarantee and was the approach of the closed
  change for #15.
- Teach the analyzer to substitute type arguments through generic aliases. Rejected: a
  generic wrapper around `Capabilities` is an abstraction over the one thing the
  declaration is supposed to show.
- Drop same-file aliases and accept only the direct form. Rejected: it would break
  documented behavior for no gain in simplicity.
