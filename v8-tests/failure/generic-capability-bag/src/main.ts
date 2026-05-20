import type { Capabilities, Capability } from "@beff/diy";

type AnyCapability = Capability<string, unknown>;

declare function use(value: unknown): void;

export function openBag(capabilities: Capabilities<Capability<string, unknown>>): void {
	use(capabilities);
}

export function aliasBag(capabilities: Capabilities<AnyCapability>): void {
	use(capabilities);
}
