import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;

function needReader(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities.reader.read();
}

declare const fallback: Capabilities<ReaderCapability> | undefined;
declare const runner: { call(capabilities: Capabilities<ReaderCapability>): string };

export function viaConditional(
	capabilities: Capabilities<ReaderCapability>,
	flag: boolean,
): string {
	return needReader(flag ? capabilities : capabilities);
}

export function viaNullish(capabilities: Capabilities<ReaderCapability>): string {
	return needReader(fallback ?? capabilities);
}

export function viaOr(capabilities: Capabilities<ReaderCapability>): string {
	return needReader(fallback || capabilities);
}

export function viaSpread(capabilities: Capabilities<ReaderCapability>): string {
	return needReader({ ...capabilities });
}

export function viaWrapper(capabilities: Capabilities<ReaderCapability>): string {
	const context = { capabilities };
	return needReader(context.capabilities);
}

export function viaNamedWrapper(capabilities: Capabilities<ReaderCapability>): string {
	const context = { bag: capabilities };
	return needReader(context.bag);
}

export function viaReturn(capabilities: Capabilities<ReaderCapability>): string {
	const pick = (): Capabilities<ReaderCapability> => capabilities;
	return needReader(pick());
}

export function viaReturnStatement(capabilities: Capabilities<ReaderCapability>): string {
	function pick(): Capabilities<ReaderCapability> {
		return capabilities;
	}
	return needReader(pick());
}

export function viaCall(capabilities: Capabilities<ReaderCapability>): string {
	return needReader.call(undefined, capabilities);
}

export function viaBind(capabilities: Capabilities<ReaderCapability>): string {
	return needReader.bind(undefined, capabilities)();
}

export function viaLocalAlias(capabilities: Capabilities<ReaderCapability>, flag: boolean): string {
	const local = capabilities;
	return needReader(flag ? local : local);
}

export function directForms(capabilities: Capabilities<ReaderCapability>): string {
	return needReader(capabilities) + needReader(capabilities as Capabilities<ReaderCapability>);
}

export function ownCallMethod(capabilities: Capabilities<ReaderCapability>): string {
	return runner.call(capabilities);
}
