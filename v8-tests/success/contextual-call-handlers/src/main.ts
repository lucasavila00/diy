import type { Capabilities, Capability } from "@beff/diy/capabilities";

type AlphaCapability = Capability<"alpha", { read(): string }>;

declare function register(
	handler: (capabilities: Capabilities<AlphaCapability>) => Promise<string>,
): void;
declare function registerObject(impl: unknown): void;

register(async (capabilities) => capabilities.alpha.read());

registerObject({
	read: async (capabilities) => capabilities.alpha.read(),
	nested: {
		ignored: async (_capabilities) => "ok",
	},
});
