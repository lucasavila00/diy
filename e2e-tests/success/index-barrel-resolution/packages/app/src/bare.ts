import type { Capabilities } from "@beff/diy";
import type { FooCapability } from "core/src/capabilities";

export function loadBare(capabilities: Capabilities<FooCapability>): string {
	return capabilities.foo.read();
}
