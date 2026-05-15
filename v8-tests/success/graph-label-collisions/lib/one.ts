import type { Capabilities, Capability } from "@beff/diy";

import type { ReadCapability } from "../src/one.ts";
import { run as runSource } from "../src/one.ts";

type WriteCapability = Capability<"write", unknown>;

export function run(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities["write"];
	runSource(capabilities);
}
