import type { Capabilities } from "@beff/diy/capabilities";
import type { AuditCapability, ClockCapability, ExternalCapability, StoreCapability } from "@caps";
import { readAudit as loadAudit, readStore } from "src/store";

export function run(
	capabilities: Capabilities<
		AuditCapability | ClockCapability | ExternalCapability | StoreCapability
	>,
): unknown {
	const now = capabilities.need("clock").now();
	const external = capabilities.need("external").get();
	return [now, external, readStore(capabilities), loadAudit(capabilities)];
}
