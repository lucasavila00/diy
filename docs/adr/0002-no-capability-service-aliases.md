# 0002. No Capability Service Aliases

Date: 2026-05-15

Status: Accepted

## Context

ADR 0001 changed `Capabilities<Allowed>` into a readonly plain object and allowed
ordinary service reads such as `capabilities.clock`.

That made dependency use lighter, but it also made this pattern possible:

```ts
const clock = capabilities.clock;
const { fs } = capabilities;
```

Those aliases recreate the old "extract dependency first" style. They make the actual
capability use less visible in the function body, and they are not the style we want for
DIY consumers.

The useful review property is that capability reads should stay obvious at the use site:

```ts
capabilities.clock.now();
await capabilities.progressLogger.progress(text);
```

## Decision

The analyzer will reject local aliases of capability services.

These patterns are disallowed:

```ts
const clock = capabilities.clock;
const fs = appCapabilities.fs;
const { clock } = capabilities;
const { fs } = appCapabilities;
const clock = capabilities["clock"];
```

Consumers should read services inline from the capability object:

```ts
const now = capabilities.clock.now();
await capabilities.progressLogger.progress("started");
```

Passing a capability service as part of a larger expression remains allowed when it does
not create a simple local alias:

```ts
const logger = createLabeledLogger(capabilities.progressLogger);
```

That value is a derived service, not a rebinding of the capability service.

First-argument forwarding of the whole `capabilities` object to another effectful
function remains allowed.

## Consequences

This is a source-style restriction enforced by `diy-cli`; it does not require a runtime
API change.

Code that previously relied on destructuring or local service variables must inline the
capability access at each use site. The result is slightly more repetitive, but the
dependency source remains explicit throughout the function body.

ADR 0001's analyzer examples are narrowed by this decision: static service reads are
still supported, but destructuring and simple service rebinding are no longer accepted
consumer patterns.

## Alternatives Considered

Allowing service aliases was rejected because it weakens the readability benefit of the
plain-object API and hides capability use behind ordinary local names.

Allowing destructuring but banning assignment aliases was rejected because both patterns
hide the same dependency flow.

Requiring aliases once per function was rejected because it preserves the old container
style and makes inline property access look like an exception instead of the normal API.
