import type { Capabilities } from "external-capabilities";

type ExternalCapability = {
	readonly kind: "external";
};

declare function use(value: unknown): void;

export function load(externalCapabilities: Capabilities<ExternalCapability>, id: string): void {
	use(externalCapabilities.need(id));
	use(externalCapabilities.need("externalDynamic"));
	use(externalCapabilities);
}
