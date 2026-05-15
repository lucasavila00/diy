import type { Capabilities, Capability } from "@beff/diy";

import { ASSERTED_READ_ID, IMPORTED_READ_ID, RENAMED_READ_ID } from "./ids.ts";

const TOP_LEVEL_READ_ID = "topReader";

type AppCapability =
	| Capability<"assertedReader", unknown>
	| Capability<"aliasedReader", unknown>
	| Capability<"importedReader", unknown>
	| Capability<"localReader", unknown>
	| Capability<"topReader", unknown>;

export function run(capabilities: Capabilities<AppCapability>): void {
	const LOCAL_READ_ID = "localReader";

	capabilities[ASSERTED_READ_ID];
	capabilities["assertedReader"];
	capabilities[IMPORTED_READ_ID];
	capabilities[LOCAL_READ_ID];
	capabilities[RENAMED_READ_ID];
	capabilities[TOP_LEVEL_READ_ID];
	const {
		["localReader"]: localRead,
		"aliasedReader": aliasedRead,
		[TOP_LEVEL_READ_ID]: topRead,
		importedReader: importedRead,
	} = capabilities;
	void localRead;
	void aliasedRead;
	void topRead;
	void importedRead;
}
