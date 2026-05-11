import { readClock } from "./clock.ts";
import { readConfig } from "./config.ts";
import type { Capabilities } from "./deps.ts";
import type { AppCapability } from "./types.ts";

export function run(capabilities: Capabilities<AppCapability>): void {
	capabilities.need("core.fs");
	readConfig(capabilities);
	readClock(capabilities);
}
