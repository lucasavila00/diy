import type { Capabilities, Capabilities as RenamedCapabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"reader", unknown>;
type QueueCapability = Capability<"queue", unknown>;
type QueueCaps = Capabilities<QueueCapability>;

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

export function renamedAliasedParameter(queue: QueueCaps): void {
	void queue;
}

export function misplacedAliasedParameter(value: string, capabilities: QueueCaps): void {
	void value;
	void capabilities;
}

export function intersectedCapabilities(
	capabilities: Capabilities<ReadCapability> & Capabilities<QueueCapability>,
): void {
	void capabilities;
}

export function intersectedAliasedCapabilities(
	capabilities: QueueCaps & Capabilities<ReadCapability>,
): void {
	void capabilities;
}

// diy-ignore-next-line
export function invalidSuppression(capabilities: RenamedCapabilities<ReadCapability>): void {
	void capabilities;
}
