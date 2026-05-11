import type { Capabilities, Capability } from "@beff/diy";

let storedCapabilities: unknown;

type FsCapability = Capability<"core.fs", unknown>;

export function start(capabilities: Capabilities<FsCapability>): void {
	storedCapabilities = capabilities;
	capabilities.need("core.fs");
}

export function readStored(): unknown {
	return storedCapabilities;
}
