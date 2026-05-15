import { Capabilities, type Capability } from "@beff/diy";

type Clock = { now(): Date };

type AppClockCapability = Capability<"appClock", Clock>;

export function readRenamed(capabilities: Capabilities<AppClockCapability>): Date {
	return capabilities.appClock.now();
}

export function load(capabilities: Capabilities<AppClockCapability>): Date {
	const clock = capabilities.appClock;
	return readRenamed(
		Capabilities.extend(
			capabilities,
			Capabilities.create<AppClockCapability>({appClock: clock,
			}),
		),
	);
}
