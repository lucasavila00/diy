import { Capabilities, type Capability } from "@beff/diy";

type Clock = { now(): Date };

type AppClockCapability = Capability<"app.clock", Clock>;

export function readRenamed(capabilities: Capabilities<AppClockCapability>): Date {
	return capabilities["app.clock"].now();
}

export function load(capabilities: Capabilities<AppClockCapability>): Date {
	const clock = capabilities["app.clock"];
	return readRenamed(
		Capabilities.extend(
			capabilities,
			Capabilities.create<AppClockCapability>({
				"app.clock": clock,
			}),
		),
	);
}
