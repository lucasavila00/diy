import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"core.fs", unknown>;

declare function use(value: unknown): void;

export function bad(capabilities: Capabilities<FsCapability>): void {
	const direct = capabilities.need;
	const { provide: provideCapabilities, need, override } = capabilities;
	let rebound: unknown = direct;
	rebound = capabilities.need;
	rebound = capabilities.provide;
	rebound = capabilities.override;
	use(capabilities.need);
	use(capabilities.provide);
	use(capabilities.override);
	use(provideCapabilities);
	use(need);
	use(override);
}

export function returns(capabilities: Capabilities<FsCapability>) {
	return capabilities.override;
}
