import type { Capabilities, Capability } from "@beff/diy";

let storedCapabilities: unknown;

type FsCapability = Capability<"fs", unknown>;

export function start(capabilities: Capabilities<FsCapability>): void {
	storedCapabilities = capabilities;
	capabilities.fs;
}

export function readStored(): unknown {
	return storedCapabilities;
}
