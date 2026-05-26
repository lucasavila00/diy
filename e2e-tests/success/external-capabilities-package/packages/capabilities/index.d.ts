import type { Capabilities as DiyCapabilities, Capability } from "@beff/diy";

export type Capabilities<Allowed extends Capability<string, unknown>> = DiyCapabilities<Allowed>;
export type { Capability };
export type DataCapability = Capability<"data", { db(): Promise<unknown> }>;
export type OperationDefinition<GCap extends Capability<string, unknown>> = {
	run(capabilities: Capabilities<GCap>, values: readonly unknown[]): Promise<readonly unknown[]>;
};
