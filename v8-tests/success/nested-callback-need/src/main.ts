import type { Capabilities, Capability } from "@beff/diy";

type ItemCapability = Capability<"itemReader", { read(id: string): string }>;

export function load(capabilities: Capabilities<ItemCapability>): readonly string[] {
	return [{ id: "a" }, { id: "b" }].map(({ id }) => capabilities.itemReader.read(id));
}
