import type { Capabilities, Capability } from "@beff/diy";

type ItemCapability = Capability<"items.read", { read(id: string): string }>;

export function load(capabilities: Capabilities<ItemCapability>): readonly string[] {
	return ["a", "b"].map((id) => capabilities.need("items.read").read(id));
}
