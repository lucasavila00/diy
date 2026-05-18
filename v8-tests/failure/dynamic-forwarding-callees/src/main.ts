import type { Capabilities, Capability } from "@beff/diy";

export type ReadCapability = Capability<"read", unknown>;

declare const registry: { run(capabilities: Capabilities<ReadCapability>): void };

const declaredRun = (capabilities: Capabilities<ReadCapability>): void => {
	capabilities.read;
};

export function loadComputed(capabilities: Capabilities<ReadCapability>): void {
	registry["run"](capabilities);
}

export function loadFromExpression(capabilities: Capabilities<ReadCapability>): void {
	({ declaredRun }).declaredRun(capabilities);
}
