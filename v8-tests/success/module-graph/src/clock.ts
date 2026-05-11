import type { Capabilities } from "@beff/diy";

import type { ClockCapability } from "./deps.ts";

export function readClock(capabilities: Capabilities<ClockCapability>): void {
	capabilities.need("core.clock");
}
