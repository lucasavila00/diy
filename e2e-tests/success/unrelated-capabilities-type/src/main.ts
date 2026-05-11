import type { Capabilities } from "external-capabilities";

type ExternalCapability = {
	readonly kind: "external";
};

declare function use(value: unknown): void;

export function load(capabilities: Capabilities<ExternalCapability>, id: string): void {
	use(capabilities.need(id));
	use(capabilities["need"]("external.dynamic"));
	use(capabilities);
}
