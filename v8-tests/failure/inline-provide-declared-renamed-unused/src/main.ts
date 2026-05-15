import { Capabilities, type Capability } from "@beff/diy";

type Clock = { now(): Date };

type LegacyClockCapability = Capability<"legacyClock", Clock>;
type AppClockCapability = Capability<"appClock", Clock>;

export function readRenamed(capabilities: Capabilities<AppClockCapability>): Date {
	return capabilities.appClock.now();
}

export function load(capabilities: Capabilities<LegacyClockCapability | AppClockCapability>): Date {
	return readRenamed(
		Capabilities.extend(
			capabilities,
			Capabilities.create<AppClockCapability>({ appClock: capabilities.legacyClock }),
		),
	);
}
