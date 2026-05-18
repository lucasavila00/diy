import type { Capabilities, Capability } from "@beff/diy";

export type ReadCapability = Capability<"read", unknown>;
export type WriteCapability = Capability<"write", unknown>;
export type AuditCapability = Capability<"audit", unknown>;

export function topLevelRead(capabilities: Capabilities<ReadCapability>): void {
	capabilities.read;
}

export namespace Helpers {
	export namespace Nested {
		export const useWrite = (capabilities: Capabilities<WriteCapability>): void => {
			capabilities.write;
		};

		export const useAudit = (capabilities: Capabilities<AuditCapability>): void => {
			capabilities.audit;
		};
	}
}
