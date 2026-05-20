import type { Capabilities, Capabilities as RenamedCapabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"reader", unknown>;

export function renamedParameter(caps: Capabilities<ReadCapability>): void {
	void caps;
}

export function misplacedParameter(
	value: string,
	capabilities: Capabilities<ReadCapability>,
): void {
	void value;
	void capabilities;
}

// diy-ignore-next-line
export function invalidSuppression(capabilities: RenamedCapabilities<ReadCapability>): void {
	void capabilities;
}
