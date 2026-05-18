import type { Capabilities, Capability } from "@beff/diy/capabilities";

import type { AlphaCapability } from "./caps.ts";

export function readKnownAndForwardGeneric<Extra extends Capability<string, unknown>>(
	capabilities: Capabilities<AlphaCapability | Extra>,
): string {
	const value = capabilities.alpha.read();
	forwardOpaque(capabilities);
	return value;
}

function forwardOpaque<Allowed extends Capability<string, unknown>>(
	capabilities: Capabilities<Allowed>,
): void {
	acceptOpaque(capabilities);
}

function acceptOpaque<Allowed extends Capability<string, unknown>>(
	capabilities: Capabilities<Allowed>,
): void {}
