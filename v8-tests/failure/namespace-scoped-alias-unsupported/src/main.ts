// @ts-nocheck -- analyzer fixture intentionally uses a value namespace under erasableSyntaxOnly.
import type { Capabilities, Capability } from "@beff/diy/capabilities";

export namespace Service {
	type DynamicCapability = Capability<string, unknown>;

	export const helper = (_capabilities: Capabilities<DynamicCapability>): void => {};
}
