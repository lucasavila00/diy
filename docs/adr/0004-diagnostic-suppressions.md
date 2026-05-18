# 0004. Diagnostic Suppressions

Date: 2026-05-18

Status: Proposed

## Context

DIY intentionally keeps capability flow reviewable: effectful functions receive a first
parameter named `capabilities`, typed as `Capabilities<...>`, and either read services
directly or forward the whole object as the first argument to another effectful function.

That rule works well for application code, but framework and transport boundaries can
produce legitimate shapes that the analyzer cannot always prove.

A concrete example came from `@q/beff-mcp`. The generic MCP transport layer owns tool
metadata and later executes a selected tool from an SDK callback. The intended shape is:

```ts
export function createBeffMcpServer(
	capabilities: Capabilities<AppCapability>,
	options: ServerOptions,
): Server {
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		return callTool(capabilities, options.tools, request);
	});
	return server;
}
```

This is a framework boundary. Capturing `capabilities` is the purpose of the server
factory: a later callback needs to run a tool with the same runtime capability object.

Today, this can produce analyzer noise:

- the callback capture can look like escaped capabilities;
- forwarding through generic or imported helpers can become unresolved;
- object literal property names such as the MCP SDK's `capabilities: { tools: {} }` can
  collide with DIY's reserved parameter name;
- renaming the parameter away from `capabilities` avoids some diagnostics but conflicts
  with the style DIY asks users to follow.

The bad workaround is to hide the flow by creating wrapper tools that receive a fake
empty parameter while closing over outer capabilities:

```ts
tool.implement(async (_capabilities: {}, input, context) => {
	return runActualTool(capabilities, input, context);
});
```

That makes the implementation less honest and less type-safe. The tool appears to need
no capabilities even though it actually depends on the captured outer object.

## Decision

Add narrow diagnostic suppressions for rare framework and analyzer-boundary cases.

The initial directive should be line-scoped:

```ts
// diy-ignore-next-line -- framework callback owns delayed tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	return callTool(capabilities, tools, request);
});
```

Rules:

- `// diy-ignore-next-line -- reason` suppresses DIY diagnostics on the next source line.
- The reason is mandatory and must contain non-whitespace text.
- The directive suppresses only diagnostics whose primary span starts on the next source
  line.
- Unused suppressions are reported as errors, like unused `@ts-expect-error`.
- The first version should not add file-wide or block-wide suppression.

Suppression is a review marker, not a normal modeling tool. Application code should
prefer direct reads and first-argument forwarding. If a shape can be expressed cleanly in
DIY's accepted subset, it should not be suppressed.

## Analyzer Improvements

Some findings from the example are analyzer bugs or missing precision and should be
fixed independently of suppressions:

- object literal property keys named `capabilities` should not be treated as uses,
  aliases, or escapes of a capabilities parameter;
- imported first-argument forwarding should be resolved when the callee's source and
  `Capabilities<...>` signature are available;
- generic helper functions should not force users into dishonest wrappers when the
  runtime flow is still a simple first-argument capability flow.

Unresolved analysis should remain diagnostic by default. Suppression exists for the small
set of framework boundaries where the analyzer cannot yet model delayed execution.

## Consequences

The analyzer remains strict for ordinary code while giving maintainers an explicit,
auditable escape hatch for known false positives.

Suppression comments make the tradeoff visible in code review. A required reason prevents
silent blanket use and gives future maintainers enough context to remove the suppression
when the analyzer improves.

Adding unused-suppression diagnostics prevents stale ignores from accumulating after
refactors or analyzer fixes.

## Alternatives Considered

Renaming framework-boundary parameters away from `capabilities` was rejected because it
makes code less consistent with DIY's core convention and does not address the underlying
false positive.

Creating wrapper functions or wrapper tools that close over capabilities was rejected
because it hides real dependency flow and can make types claim fewer capabilities than
the code actually needs.

Making the analyzer permissive for callbacks was rejected because callback boundaries are
also where real capability escapes can happen.

Adding file-wide ignores was rejected for the initial version because they are too broad
for a dependency-flow analyzer. A line-scoped directive is enough for the current
framework-boundary use case.
