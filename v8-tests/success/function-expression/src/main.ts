import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"read", unknown>;
type ReadCapabilities = Capabilities<ReadCapability>;

export const run = (capabilities: ReadCapabilities): void => {
	capabilities.read;
};
