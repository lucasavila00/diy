import { Capabilities } from "@beff/diy";

import "../../outside-capability.ts";
import type { EdgeCapability, ExtraCapability } from "./caps.ts";
import { internalUse } from "./internal.ts";

declare const extra: { run(): void };
declare const extraCapabilities: Capabilities<ExtraCapability>;

declare namespace Other {
	export type Capabilities<T> = { value: T };
	export namespace Nested {
		export type Capabilities<T> = { value: T };
	}
}

function needEdge(capabilities: Capabilities<EdgeCapability>): void {
	capabilities.edge.run();
}

function needEmpty(capabilities: Capabilities<never>): void {
	void capabilities;
}

export default function (capabilities: Capabilities<EdgeCapability>): void {
	capabilities.edge.run();
}

export function extendFromTypedValue(capabilities: Capabilities<EdgeCapability>): void {
	const extended = Capabilities.extend(capabilities, extraCapabilities);
	needEdge(extended);
}

export function mergeEmpty(capabilities: Capabilities<never>): void {
	needEmpty(Capabilities.merge(capabilities));
}

export function passProvidedToEmpty(capabilities: Capabilities<EdgeCapability>): void {
	needEmpty(Capabilities.merge(capabilities));
}

export function passDirectToEmpty(capabilities: Capabilities<EdgeCapability>): void {
	needEmpty(capabilities);
}

export function helperWithCreatedOnly(capabilities: Capabilities<EdgeCapability>): void {
	capabilities.edge.run();
	capabilities[`edge`].run();
	Capabilities.extend(Capabilities.create<ExtraCapability>({ extra }));
	needEmpty(Capabilities.merge(Capabilities.create<ExtraCapability>({ extra })));
}

export function ignoredOther(other: Other.Capabilities<EdgeCapability>): void {
	void other;
}

export function ignoredNestedOther(other: Other.Nested.Capabilities<EdgeCapability>): void {
	void other;
}

export function returnOnly(capabilities: Capabilities<EdgeCapability>): void {
	capabilities.edge.run();
	return;
}

export function assignmentWithUntrackedValue(capabilities: Capabilities<EdgeCapability>): void {
	capabilities.edge.run();
	let value = 0;
	value = 1;
}

export function useImportedInternal(capabilities: Capabilities<EdgeCapability>): void {
	capabilities.edge.run();
	internalUse();
}
