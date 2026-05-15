import type { Capabilities, Capability } from "@beff/diy";

type Clock = { now(): Date };

type AnyClockCapability = Capability<string, Clock>;

export function load(capabilities: Capabilities<AnyClockCapability>): Date {
	capabilities.appClock;
	return new Date(0);
}
