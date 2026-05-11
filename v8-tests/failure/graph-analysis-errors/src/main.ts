import type { Capabilities, Capability } from "@beff/diy";

type ClockCapability = Capability<"clock", unknown>;

export function run(capabilities: Capabilities<ClockCapability>): void {
	void capabilities;
}
