import type { Capabilities, Capability } from "@beff/diy";

type ClockCapability = Capability<"clock", unknown>;

export function run(capabilities: Capabilities<ClockCapability>, id: string): void {
	// @ts-expect-error intentionally invalid for analyzer coverage
	void capabilities[id];
}
