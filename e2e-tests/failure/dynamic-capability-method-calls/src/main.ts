import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"core.fs", unknown>;

declare function use(value: unknown): void;

export function bad(capabilities: Capabilities<FsCapability>, id: string): void {
	// @ts-expect-error intentionally invalid for analyzer coverage
	use(capabilities.need(id));
	// @ts-expect-error intentionally invalid for analyzer coverage
	use(capabilities.need(`core.${id}`));
	use(capabilities["need"]("core.fs"));
	use(capabilities["provide"]({ "core.clock": {} }));
	use(capabilities.override?.({ "core.fs": {} }));
}
