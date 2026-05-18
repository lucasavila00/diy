import type { Capabilities } from "@beff/diy";

import type { ReadCapability } from "./main.ts";

const declaredRun = (capabilities: Capabilities<ReadCapability>): void => {
	capabilities.read;
};

export const registry = { run: declaredRun };
