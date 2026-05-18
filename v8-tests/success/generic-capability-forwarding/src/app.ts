import type { Capabilities } from "@beff/diy/capabilities";

import type { AppToolCapability } from "./caps.ts";
import { createGenericToolServer, type ToolDef, type ToolServer } from "./transport.ts";

declare const queryTool: ToolDef<"query", AppToolCapability>;
declare const syncTool: ToolDef<"sync", AppToolCapability>;

export const appTools = [queryTool, syncTool] as const;

export function createAppToolServer(capabilities: Capabilities<AppToolCapability>): ToolServer {
	return createGenericToolServer(capabilities, {
		serverInfo: {
			name: "generic-tools",
			version: "0.1.0",
		},
		tools: appTools,
	});
}
