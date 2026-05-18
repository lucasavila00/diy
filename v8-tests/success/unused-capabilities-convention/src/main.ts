import type { Capabilities, Capability } from "@beff/diy/capabilities";

type AlphaCapability = Capability<"alpha", { read(): string }>;

export const typedButIntentionallyUnused = async (
	_capabilities: Capabilities<AlphaCapability>,
): Promise<string> => "ok";

declare function register(
	handler: (capabilities: Capabilities<AlphaCapability>) => Promise<string>,
): void;

register(async (_capabilities) => "ok");

export function nestedCallback(
	_capabilities: Capabilities<AlphaCapability>,
	callback: (capabilities: Capabilities<AlphaCapability>) => Promise<void>,
): Promise<void> {
	return callback(_capabilities);
}
