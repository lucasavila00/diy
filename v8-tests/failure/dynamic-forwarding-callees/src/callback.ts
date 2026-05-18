import type { Capabilities } from "@beff/diy";

import type { ReadCapability } from "./main.ts";

type Callback = {
	run(capabilities: Capabilities<ReadCapability>): void;
};

export function loadCallback(capabilities: Capabilities<ReadCapability>, callback: Callback): void {
	callback.run(capabilities);
}
