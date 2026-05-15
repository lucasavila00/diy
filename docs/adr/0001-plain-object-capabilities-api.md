# 0001. Plain Object Capabilities API

Date: 2026-05-15

Status: Accepted

## Context

DIY originally exposed dependencies through a `Capabilities` class with methods such as
`capabilities.need("clock")`, `capabilities.provide(...)`, and
`capabilities.override(...)`.

That API made every consumer pay an ergonomic cost at the use site. Reading a dependency
looked like an operation on a container instead of a normal property read, and the string
lookup form made simple dependencies feel heavier than ordinary JavaScript objects.

The important property to preserve was type behavior:

- users define dependencies as `Capability<Id, Service>` types;
- users compose dependency sets with TypeScript unions;
- a broader capability object can be passed to a function that only needs a narrower
  capability union;
- the analyzer can still statically determine which capabilities a function uses.

## Decision

`Capabilities<Allowed>` is now a readonly plain object type whose keys are capability IDs
and whose values are the corresponding services.

Consumers read services directly:

```ts
type ClockCapability = Capability<"clock", Clock>;
type FsCapability = Capability<"fs", Fs>;

function run(capabilities: Capabilities<ClockCapability | FsCapability>): void {
	const now = capabilities.clock.now();
	const fs = capabilities.fs;
}
```

`Capabilities` remains available as a value namespace for construction and composition:

```ts
const capabilities = Capabilities.create<AppCapability>({
	clock,
	fs: fs,
});

const requestCapabilities = Capabilities.extend(
	capabilities,
	Capabilities.create<RequestCapability>({ request }),
);
```

The supported helper surface is:

- `Capabilities.create(...)`
- `Capabilities.extend(...)`
- `Capabilities.override(...)`
- `Capabilities.merge(...)`

Containers do not carry instance methods. This keeps the runtime value a plain service
object and avoids method-name collisions with capability IDs.

The analyzer recognizes static service reads:

- `capabilities.clock`
- `capabilities.fs`
- destructuring such as `const { clock } = capabilities`
- computed keys only when they resolve to string constants

Dynamic access, rest destructuring, storing the full `capabilities` object, and other
patterns that hide dependency flow remain unsupported.

## Consequences

This is a breaking API change. Existing consumers must replace `.need(...)` calls with
property or bracket reads, and replace instance composition methods with static
`Capabilities` helpers.

The public API now better matches the mental model: a capability object is just the
object of services a function can use. The analyzer remains intentionally strict, but its
rules now describe ordinary object access instead of a special lookup method.

Capability IDs may still be any string. Identifier-safe IDs such as `"clock"` support dot
access, while IDs such as `"fs"` use bracket access.

## Alternatives Considered

Keeping `.need(...)` as a compatibility shim was rejected because it would keep the old
consumer shape alive and prevent the container from being a plain object.

Keeping instance `.provide(...)` and `.override(...)` was rejected because those methods
would be mixed into the same namespace as service properties and could collide with real
capability IDs.

Moving to object-schema dependency declarations was rejected for this change because the
existing `Capability<Id, Service>` union model already expresses composition well and
preserves the desired variance behavior.
