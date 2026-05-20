import { Capabilities } from "@beff/diy";
import * as Diy from "@beff/diy";
import type { Capability } from "@beff/diy";

import type { EdgeCapability, HiddenCapability } from "./caps.ts";

type DynamicCapability = Capability<string, unknown>;

declare const hidden: unknown;
declare const hiddenKey: string;

export function internalUnsupported(capabilities: Capabilities<DynamicCapability>): void {
	void capabilities;
}

export function internalProvider(capabilities: Capabilities<HiddenCapability>): void {
	Capabilities.extend(capabilities, { hidden });
}

export function namespaceTyped(capabilities: Diy.Capabilities<EdgeCapability>): void {
	capabilities.edge.run();
}

export function optionalElementAccess(capabilities: Capabilities<EdgeCapability>): void {
	capabilities?.["edge"];
}

export function computedProvider(capabilities: Capabilities<HiddenCapability>): void {
	Capabilities.extend(capabilities, { [hiddenKey]: hidden });
}

export function internalUse(): void {
	internalUnsupported;
	internalProvider;
	namespaceTyped;
	optionalElementAccess;
	computedProvider;
}
