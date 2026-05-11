import type { Capabilities, Capability } from "@beff/diy";

type Clock = { now(): Date };

type AnyClockCapability = Capability<string, Clock>;

export function load(capabilities: Capabilities<AnyClockCapability>): Date {
	capabilities.need("app.clock");
	return new Date(0);
}
