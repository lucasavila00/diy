import type { Capabilities } from "@beff/diy";

import type { FooCapability } from "..";

export function loadParent(capabilities: Capabilities<FooCapability>): string {
	return capabilities.foo.read();
}
