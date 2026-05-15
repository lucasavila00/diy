import type { Capabilities, Capability } from "@beff/diy";

import { ASSERTED_READ_ID, IMPORTED_READ_ID, RENAMED_READ_ID } from "./ids.ts";

const TOP_LEVEL_READ_ID = "read.top";

type AppCapability =
	| Capability<"read.asserted", unknown>
	| Capability<"read.alias", unknown>
	| Capability<"read.imported", unknown>
	| Capability<"read.local", unknown>
	| Capability<"read.top", unknown>;

export function run(capabilities: Capabilities<AppCapability>): void {
	const LOCAL_READ_ID = "read.local";

	capabilities[ASSERTED_READ_ID];
	capabilities[IMPORTED_READ_ID];
	capabilities[LOCAL_READ_ID];
	capabilities[RENAMED_READ_ID];
	capabilities[TOP_LEVEL_READ_ID];
	const {
		["read.local"]: localRead,
		[TOP_LEVEL_READ_ID]: topRead,
		"read.imported": importedRead,
	} = capabilities;
	void localRead;
	void topRead;
	void importedRead;
}
