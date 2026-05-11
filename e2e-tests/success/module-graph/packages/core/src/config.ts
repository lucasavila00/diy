import type { Capabilities, FsCapability } from "@q/core/src/deps.ts";

export function readConfig(capabilities: Capabilities<FsCapability>): void {
	capabilities.need("core.fs");
}
