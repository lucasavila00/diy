import type { Capabilities, Capability } from "@beff/diy/capabilities";

type AlphaCapability = Capability<"alpha", { read(): string }>;
type BetaCapability = Capability<"beta", { write(text: string): void }>;

export function readGenericCapability<Allowed extends AlphaCapability>(
	capabilities: Capabilities<Allowed>,
): void {
	// @ts-expect-error -- analyzer fixture intentionally reads from an opaque generic parameter.
	capabilities.alpha.read();
}

export function readGenericUnion<Allowed extends AlphaCapability | BetaCapability>(
	capabilities: Capabilities<Allowed>,
): void {
	// @ts-expect-error -- analyzer fixture intentionally reads from an opaque generic parameter.
	capabilities.beta.write("direct generic read");
}
