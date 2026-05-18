import type { Capabilities, Capability } from "@beff/diy/capabilities";

type AnyCapability = Capability<string, unknown>;

export type ToolDef<Name extends string, ToolCapability extends AnyCapability> = {
	readonly name: Name;
	impl(capabilities: Capabilities<ToolCapability>): Promise<unknown>;
};

export type ToolServer = {
	readonly name: string;
	readonly stop: () => void;
};

type GenericToolServerOptions<ToolCapability extends AnyCapability> = {
	readonly serverInfo: {
		readonly name: string;
		readonly version: string;
	};
	readonly tools: readonly ToolDef<string, ToolCapability>[];
};

export function createGenericToolServer<ToolCapability extends AnyCapability>(
	capabilities: Capabilities<ToolCapability>,
	options: GenericToolServerOptions<ToolCapability>,
): ToolServer {
	return startGenericTransport(capabilities, options);
}

function startGenericTransport<ToolCapability extends AnyCapability>(
	capabilities: Capabilities<ToolCapability>,
	options: GenericToolServerOptions<ToolCapability>,
): ToolServer {
	return finishGenericTransport(capabilities, options);
}

function finishGenericTransport<ToolCapability extends AnyCapability>(
	capabilities: Capabilities<ToolCapability>,
	options: GenericToolServerOptions<ToolCapability>,
): ToolServer {
	options.tools.length;
	return {
		name: options.serverInfo.name,
		stop() {},
	};
}
