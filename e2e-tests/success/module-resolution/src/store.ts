import type { Capabilities } from "@beff/diy/capabilities";

import type { StoreCapability } from "./caps.ts";

export function readStore(capabilities: Capabilities<StoreCapability>): string {
	return capabilities.need("store").read();
}
