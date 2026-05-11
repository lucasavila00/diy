import type { Capabilities, Capability } from "@beff/diy";

type Clock = { now(): Date };

type LegacyClockCapability = Capability<"legacy.clock", Clock>;
type AppClockCapability = Capability<"app.clock", Clock>;

export function readRenamed(capabilities: Capabilities<AppClockCapability>): Date {
	return capabilities.need("app.clock").now();
}

export function load(capabilities: Capabilities<LegacyClockCapability | AppClockCapability>): Date {
	return readRenamed(
		capabilities.provide<AppClockCapability>({
			"app.clock": capabilities.need("legacy.clock"),
		}),
	);
}
