import type { Capabilities, Capability } from "@beff/diy";

type AlphaCapability = Capability<"alpha", { read(): string }>;
type BetaCapability = Capability<"beta", { write(value: string): void }>;

function wrapHandler<InnerCapability extends Capability<string, unknown>>(
	handler: (capabilities: Capabilities<InnerCapability>) => void,
): (capabilities: Capabilities<InnerCapability>) => void {
	return (capabilities) => handler(capabilities);
}

const wrappedAlpha = wrapHandler((capabilities: Capabilities<AlphaCapability>): void => {
	capabilities.alpha.read();
});

export function forwardFactoryReturnedBoundary(
	capabilities: Capabilities<AlphaCapability | BetaCapability>,
): void {
	wrappedAlpha(capabilities);
}

export function overDeclaredLeaf(
	capabilities: Capabilities<AlphaCapability | BetaCapability>,
): void {
	capabilities.alpha.read();
}

export function trustsLeafBoundary(
	capabilities: Capabilities<AlphaCapability | BetaCapability>,
): void {
	overDeclaredLeaf(capabilities);
}
