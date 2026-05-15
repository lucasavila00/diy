import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"read", unknown>;

export const run = (capabilities: Capabilities<ReadCapability>): void => {
	capabilities.read;
};
