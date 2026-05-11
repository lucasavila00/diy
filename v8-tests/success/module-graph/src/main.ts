import type { Capabilities } from "@beff/diy";

import { readClock } from "./clock.ts";
import { readConfig } from "./config.ts";
import type { SecretCapability } from "./deps.ts";
import type { AppCapability } from "./types.ts";

export function run(capabilities: Capabilities<AppCapability>): void {
	const envValues = ["PATH"].map((name) => capabilities.need("core.env"));
	capabilities.need("core.fs");
	readConfig(capabilities);
	readClock(capabilities);
	void envValues;
	function nestedOnly(capabilities: Capabilities<SecretCapability>): void {
		capabilities.need("core.secret");
	}
	void nestedOnly;
}
