import type { Capabilities } from "@beff/diy";

import type { AlphaCapability, BetaCapability, GammaCapability } from "./caps.ts";

export function needAlpha(capabilities: Capabilities<AlphaCapability>): void {
	capabilities.alpha.read();
}

export function needAlphaBeta(capabilities: Capabilities<AlphaCapability | BetaCapability>): void {
	capabilities.alpha.read();
	capabilities.beta.write("ok");
}

export function needAlphaGamma(
	capabilities: Capabilities<AlphaCapability | GammaCapability>,
): void {
	capabilities.alpha.read();
	capabilities.gamma.run();
}

export namespace ToolHandlers {
	export function needAlpha(capabilities: Capabilities<AlphaCapability>): void {
		capabilities.alpha.read();
	}
}

export function makeAlphaRunner(): (capabilities: Capabilities<AlphaCapability>) => void {
	return needAlpha;
}
