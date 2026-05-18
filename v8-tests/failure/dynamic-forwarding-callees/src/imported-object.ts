import type { Capabilities } from "@beff/diy";

import type { ReadCapability } from "./main.ts";
import { registry } from "./registry.ts";

export function loadImportedObject(capabilities: Capabilities<ReadCapability>): void {
	registry.run(capabilities);
}
