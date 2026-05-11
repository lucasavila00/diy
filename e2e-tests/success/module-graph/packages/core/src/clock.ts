import type { Capabilities, ClockCapability } from "@q/core/src/deps.ts";

export function readClock(capabilities: Capabilities<ClockCapability>): void {
	capabilities.need("core.clock");
}
