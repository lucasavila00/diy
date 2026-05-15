import type { Capabilities } from "@beff/diy";

import type { SpawnCapability } from "../../core/src/deps.ts";
import type { ModelCapability } from "../../model/src/types.ts";

type AppCapability = Exclude<ModelCapability, SpawnCapability>;

export function run(capabilities: Capabilities<AppCapability>): void {
	capabilities.fs;
}
