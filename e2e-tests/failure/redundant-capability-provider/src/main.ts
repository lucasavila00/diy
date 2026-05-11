import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"read", unknown>;
type WriteCapability = Capability<"write", unknown>;

export function load(
	capabilities: Capabilities<ReadCapability | WriteCapability>,
): Capabilities<ReadCapability | WriteCapability> {
	return capabilities.provide<WriteCapability>({ write: {} });
}
