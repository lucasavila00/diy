import type { AppCapability } from "@q/app/src/types.ts";
import { readClock } from "@q/core/src/clock.ts";
import { readConfig } from "@q/core/src/config.ts";
import type { Capabilities } from "@q/core/src/deps.ts";

export function run(capabilities: Capabilities<AppCapability>): void {
	capabilities.need("core.fs");
	readConfig(capabilities);
	readClock(capabilities);
}
