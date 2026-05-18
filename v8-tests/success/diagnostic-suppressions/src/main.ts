import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"fs", unknown>;

declare function use(value: unknown): void;

export function start(capabilities: Capabilities<FsCapability>): void {
	const metadata = { capabilities: { tools: {} } };
	use(metadata);
	// diy-ignore-next-line -- framework callback owns delayed tool execution
	void capabilities;
	capabilities.fs;
}
