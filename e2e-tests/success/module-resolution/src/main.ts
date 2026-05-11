import type { Capabilities } from "@beff/diy/capabilities";
import type { ClockCapability, ExternalCapability, StoreCapability } from "@caps";
import { readStore } from "src/store";

export function run(
	capabilities: Capabilities<ClockCapability | ExternalCapability | StoreCapability>,
): unknown {
	const now = capabilities.need("clock").now();
	const external = capabilities.need("external").get();
	return [now, external, readStore(capabilities)];
}
