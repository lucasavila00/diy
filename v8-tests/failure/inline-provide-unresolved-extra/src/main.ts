import { Capabilities, type Capability } from "@beff/diy";

type Clock = { now(): Date };

type LegacyClockCapability = Capability<"legacy.clock", Clock>;
type AppClockCapability = Capability<"app.clock", Clock>;
type AnyClockCapability = Capability<string, Clock>;

export function readRenamed(capabilities: Capabilities<AppClockCapability>): Date {
	return capabilities["app.clock"].now();
}

export function load(capabilities: Capabilities<LegacyClockCapability>): Date {
	return readRenamed(
		Capabilities.extend(
			capabilities,
			Capabilities.create<AnyClockCapability>({
				"app.clock": capabilities["legacy.clock"],
			}),
		),
	);
}
