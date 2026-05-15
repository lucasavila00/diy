import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"fs", unknown>;

declare function use(value: unknown): void;

export function bad(capabilities: Capabilities<FsCapability>, id: string): void {
	const dynamicId = "fs" + id;

	// @ts-expect-error intentionally invalid for analyzer coverage
	use(capabilities[id]);
	// @ts-expect-error intentionally invalid for analyzer coverage
	use(capabilities[`fs${id}`]);
	// @ts-expect-error intentionally invalid for analyzer coverage
	use(capabilities[dynamicId]);
	use(capabilities?.fs);
	// @ts-expect-error intentionally invalid for analyzer coverage
	const { [dynamicId]: fs } = capabilities;
	use(fs);
	// @ts-expect-error intentionally invalid for analyzer coverage
	const { [`fs${id}`]: templatedFs } = capabilities;
	use(templatedFs);
}
