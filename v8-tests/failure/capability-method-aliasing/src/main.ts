import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"fs", unknown>;

declare function use(value: unknown): void;

export function bad(capabilities: Capabilities<FsCapability>): void {
	const fs = capabilities.fs;
	const bracketFs = capabilities["fs"];
	const direct = capabilities;
	let rebound: unknown = direct;
	rebound = capabilities;
	rebound = capabilities.fs;
	use(fs);
	use(bracketFs);
	use(direct);
	use(rebound);
}

export function returns(capabilities: Capabilities<FsCapability>) {
	capabilities.fs;
	return capabilities;
}
