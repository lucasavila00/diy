import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"fs", unknown>;

export function start(capabilities: Capabilities<FsCapability>): void {
	// diy-ignore-next-line
	capabilities.fs;
}

export function stop(capabilities: Capabilities<FsCapability>): void {
	// diy-ignore-next-line --
	capabilities.fs;
}
