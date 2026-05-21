import { Capabilities } from "@beff/diy";

import type { AlphaCapability, BetaCapability, DeltaCapability, GammaCapability } from "./caps.ts";
import {
	makeAlphaRunner,
	needAlpha,
	needAlphaBeta,
	needAlphaGamma,
	ToolHandlers,
	wrappedAlpha,
} from "./handlers.ts";

declare const alphaReplacement: { read(): string };
declare const beta: { write(value: string): void };
declare function use(value: unknown): void;

export function directProperty(capabilities: Capabilities<AlphaCapability>): void {
	use(capabilities.alpha);
}

export function directBracket(capabilities: Capabilities<AlphaCapability>): void {
	use(capabilities["alpha"]);
}

export async function readAfterAwait(capabilities: Capabilities<AlphaCapability>): Promise<string> {
	await Promise.resolve();
	if (Date.now() > 0) {
		return capabilities.alpha.read();
	}
	return capabilities.alpha.read();
}

export function forwardWholeBag(capabilities: Capabilities<AlphaCapability>): void {
	needAlpha(capabilities);
}

export function forwardNamespace(capabilities: Capabilities<AlphaCapability>): void {
	ToolHandlers.needAlpha(capabilities);
}

export function forwardFactoryResult(capabilities: Capabilities<AlphaCapability>): void {
	makeAlphaRunner()(capabilities);
}

export function forwardFactoryReturnedBoundary(
	capabilities: Capabilities<AlphaCapability | DeltaCapability>,
): void {
	wrappedAlpha(capabilities);
}

export function aliasThenForward(capabilities: Capabilities<AlphaCapability>): void {
	const alias = capabilities;
	needAlpha(alias);
}

export function assignmentAliasThenForward(capabilities: Capabilities<AlphaCapability>): void {
	let alias: Capabilities<AlphaCapability>;
	alias = capabilities;
	needAlpha(alias);
}

export function mergeThenForward(capabilities: Capabilities<AlphaCapability>): void {
	const merged = Capabilities.merge(capabilities, Capabilities.create<BetaCapability>({ beta }));
	needAlphaBeta(merged);
}

export function extendThenForward(capabilities: Capabilities<AlphaCapability>): void {
	const extended = Capabilities.extend(capabilities, Capabilities.create<BetaCapability>({ beta }));
	needAlphaBeta(extended);
}

export function overrideThenForward(
	capabilities: Capabilities<AlphaCapability | GammaCapability>,
): void {
	capabilities.alpha.read();
	const overridden = Capabilities.override(capabilities, {
		alpha: alphaReplacement,
	});
	needAlphaGamma(overridden);
}

export function propagatedAliasThenForward(capabilities: Capabilities<AlphaCapability>): void {
	const merged = Capabilities.merge(capabilities, Capabilities.create<BetaCapability>({ beta }));
	const alias = merged;
	needAlphaBeta(alias);
}
