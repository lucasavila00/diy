import type { Capabilities } from "@beff/diy";

type EntityId = string;
type CompressedWidgetOutput = {
	readonly items: readonly string[];
};

export const getWidgetHistoryItem = async (
	_capabilities: Capabilities<never>,
	_entityId: EntityId,
): Promise<CompressedWidgetOutput> => {
	throw "not implemented";
};
