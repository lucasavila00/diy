import type { Capabilities } from "@beff/diy";

import * as HelperModule from "./helpers.ts";
import { Helpers as ImportedHelpers, topLevelRead } from "./helpers.ts";
import type { AuditCapability, ReadCapability, WriteCapability } from "./helpers.ts";

export function run(
	capabilities: Capabilities<AuditCapability | ReadCapability | WriteCapability>,
): void {
	topLevelRead(capabilities);
	ImportedHelpers.Nested.useWrite(capabilities);
	HelperModule.Helpers.Nested.useAudit(capabilities);
}
