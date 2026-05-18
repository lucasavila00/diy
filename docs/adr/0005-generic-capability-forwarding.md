# 0005. Generic Capability Forwarding

Date: 2026-05-18

Status: Proposed

## Context

ADR 0004 added narrow diagnostic suppressions for cases where framework or transport
boundaries produce legitimate capability flows the analyzer cannot yet prove.

One anonymized example is a reusable tool transport. Application tools declare their own
capability type, then a concrete server forwards its runtime capabilities into a generic
transport:

```ts
type AppToolCapability = AlphaCapability | BetaCapability | GammaCapability;

export const appTools = [
	alphaTool,
	betaTool,
] as const;

export function createAppToolServer(capabilities: Capabilities<AppToolCapability>) {
	return createGenericToolServer(capabilities, {
		serverInfo: {
			name: "generic-tools",
			version: "0.1.0",
		},
		tools: appTools,
	});
}
```

That concrete call is ordinary first-argument forwarding. It should not require a
suppression comment.

The transport itself is intentionally generic. Each tool carries the capability type it
needs:

```ts
export type AnyCapability = Capability<string, unknown>;

export type ToolDef<
	Name extends string,
	Input,
	Output,
	ToolCapability extends AnyCapability,
> = {
	name: Name;
	inputSchema: Parser<Input>;
	outputSchema: Parser<Output>;
	impl(
		capabilities: Capabilities<ToolCapability>,
		input: Input,
		context: RequestContext,
	): Promise<Output>;
};

export function newToolDef<const Name extends string, Input, Output>(
	config: ToolConfig<Name, Input, Output>,
) {
	return {
		implement<ToolCapability extends AnyCapability>(
			impl: (
				capabilities: Capabilities<ToolCapability>,
				input: Input,
				context: RequestContext,
			) => Promise<Output>,
		): ToolDef<Name, Input, Output, ToolCapability> {
			return {
				...config,
				async impl(capabilities, input, context) {
					return impl(capabilities, input, context);
				},
			};
		},
	};
}
```

At the framework boundary, the selected tool is often chosen from a runtime request:

```ts
async function runTool(
	capabilities: Capabilities<AnyCapability>,
	tools: readonly ToolDef<string, unknown, unknown, AnyCapability>[],
	name: string,
	args: unknown,
	context: RequestContext,
): Promise<unknown> {
	const tool = findTool(tools, name);
	const input = tool.inputSchema.parse(args);
	return tool.impl(capabilities, input, context);
}
```

Current analyzer behavior tends to treat these generic and imported forwarding paths as
unresolved. That pushes users toward `diy-ignore-next-line` even when the code is
following DIY's normal rule: pass the whole capability object as the first argument.

## Decision

Improve the analyzer so generic capability forwarding is a supported modeling pattern.
Suppression should remain available for framework boundaries the analyzer cannot yet
model, but it should not be the normal answer for generic transport APIs.

The analyzer should recognize function parameters typed as DIY `Capabilities<...>` even
when the allowed capability type is generic:

```ts
function forward<Allowed extends Capability<string, unknown>>(
	capabilities: Capabilities<Allowed>,
): void {
	return run(capabilities);
}
```

When the analyzer cannot resolve the concrete capability IDs for a generic parameter, it
should treat that parameter as an opaque capability set:

- forwarding the whole object as the first argument remains analyzable;
- direct service reads still require known capability IDs;
- transformed capability objects still need explicit analyzer support;
- unsupported dynamic dispatch should remain diagnostic by default.

Imported first-argument forwarding should also be resolved when the callee's source is
available and its first parameter is a DIY capability parameter, including generic forms
such as `Capabilities<Allowed>`.

When a framework callback needs a `Capabilities<...>` parameter only to preserve generic
or contextual typing and the body does not read from it, authors should name the
parameter `_capabilities`. The analyzer treats that spelling as intentional and does not
report unused capabilities for that function.

This creates a useful split:

- application code forwarding `Capabilities<AppCapability>` into an imported generic
  transport should pass without a suppression;
- transport internals that erase the selected tool to a runtime lookup may still need
  suppressions or future transport-specific analysis;
- delayed SDK callbacks remain strict unless the analyzer can prove the callback only
  forwards the captured capability object to an effectful target.

## Consequences

The analyzer becomes more useful for framework authors without weakening ordinary
application rules.

Generic APIs can honestly describe capability flow with TypeScript types instead of
accepting `unknown` or relying on suppression comments at every concrete call site.

The analyzer still does not infer arbitrary capabilities from a type parameter. Generic
capability parameters are safe to forward, but not safe to read from unless their allowed
capability IDs can be resolved.

Some existing suppressions should become unused after the analyzer improves. ADR 0004's
unused-suppression diagnostic will then point maintainers at comments that can be
removed.

## Alternatives Considered

Keeping generic transports typed as `unknown` was rejected because it hides real
capability flow from both TypeScript and the analyzer. It also pushes suppressions into
ordinary application code that is only forwarding capabilities.

Using diagnostic suppressions for all generic transport calls was rejected because it
makes suppressions a normal modeling tool instead of a review marker for rare analyzer
gaps.

Making generic capability parameters fully permissive was rejected because it would allow
unreviewable service reads such as `capabilities.anything` when the analyzer cannot know
which capability IDs are valid.

Adding framework-specific allowlists was rejected for now because the reusable rule is
generic first-argument forwarding, not a particular transport package.
