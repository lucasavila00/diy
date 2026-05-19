import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"fs", unknown>;

declare function use(value: unknown): void;

export function start(capabilities: Capabilities<FsCapability>): void {
	const metadata = { capabilities: { tools: {} } };
	use(metadata);
	void capabilities;
	capabilities.fs;
}
