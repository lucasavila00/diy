import type { Capabilities, Capability } from "@beff/diy";

type Clock = { now(): Date };

type AppClockCapability = Capability<"app.clock", Clock>;

export function readRenamed(capabilities: Capabilities<AppClockCapability>): Date {
	return capabilities.need("app.clock").now();
}

export function load(capabilities: Capabilities<AppClockCapability>): Date {
	const clock = capabilities.need("app.clock");
	return readRenamed(
		capabilities.provide<AppClockCapability>({
			"app.clock": clock,
		}),
	);
}
