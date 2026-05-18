import type { Capabilities } from "@beff/diy";

import type { FooCapability } from "../capabilities";

export function loadRelative(capabilities: Capabilities<FooCapability>): string {
	return capabilities.foo.read();
}
