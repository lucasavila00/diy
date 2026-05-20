import type { Capabilities, Capability } from "@beff/diy";

export type ReadCapability = Capability<"read", unknown>;

declare const registry: { run(capabilities: Capabilities<ReadCapability>): void };
declare const dynamicRun: (...args: any[]) => void;

const declaredRun = (capabilities: Capabilities<ReadCapability>): void => {
	capabilities.read;
};

export function loadComputed(capabilities: Capabilities<ReadCapability>): void {
	registry["run"](capabilities);
}

export function loadFromExpression(capabilities: Capabilities<ReadCapability>): void {
	dynamicRun(capabilities);
}
