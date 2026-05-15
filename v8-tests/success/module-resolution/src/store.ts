import type { Capabilities } from "@beff/diy/capabilities";

import type { AuditCapability, StoreCapability } from "./caps.ts";

export function readAudit(capabilities: Capabilities<AuditCapability>): string {
	return capabilities["audit"].record();
}

export function readStore(capabilities: Capabilities<StoreCapability>): string {
	return capabilities["store"].read();
}
