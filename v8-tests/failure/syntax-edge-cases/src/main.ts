import type { Capabilities, Capability } from "@beff/diy";
import * as diy from "@beff/diy";

type ReadCapability = Capability<"read", unknown>;

declare function use(...value: unknown[]): void;
declare const other: { need: unknown };

void diy;

export function destructureRest(capabilities: Capabilities<ReadCapability>): void {
	const { ...rest } = capabilities;
	use(rest);
}

export function duplicateEscape(capabilities: Capabilities<ReadCapability>): void {
	use(capabilities, capabilities);
}

export function nestedShadow(capabilities: Capabilities<ReadCapability>): void {
	function inner(capabilities: unknown): void {
		use(capabilities);
	}
	inner(capabilities);
}

export function destructuredParam(
	{ value }: { value: unknown },
	capabilities: Capabilities<ReadCapability>,
): void {
	const { need } = other;
	use(value);
	use(need);
	use(capabilities);
}

export * from "@beff/diy/capabilities";
export * as DiyCapabilities from "@beff/diy";
export type { Capability } from "@beff/diy";
