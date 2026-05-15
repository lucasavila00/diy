import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"core.fs", unknown>;

declare function use(value: unknown): void;

export function bad(capabilities: Capabilities<FsCapability>): void {
	const fs = capabilities["core.fs"];
	const direct = capabilities;
	let rebound: unknown = direct;
	rebound = capabilities;
	use(fs);
	use(direct);
	use(rebound);
}

export function returns(capabilities: Capabilities<FsCapability>) {
	capabilities["core.fs"];
	return capabilities;
}
