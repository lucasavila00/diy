import { Capabilities, type Capability } from "@beff/diy";

type Clock = { now(): Date };

type LegacyClockCapability = Capability<"legacyClock", Clock>;
type AppClockCapability = Capability<"appClock", Clock>;
type AnyClockCapability = Capability<string, Clock>;

export function readRenamed(capabilities: Capabilities<AppClockCapability>): Date {
	return capabilities.appClock.now();
}

export function load(capabilities: Capabilities<LegacyClockCapability>): Date {
	return readRenamed(
		Capabilities.extend(
			capabilities,
			Capabilities.create<AnyClockCapability>({appClock: capabilities.legacyClock,
			}),
		),
	);
}
