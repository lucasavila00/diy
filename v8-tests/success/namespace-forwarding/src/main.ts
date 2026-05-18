import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"read", unknown>;
type WriteCapability = Capability<"write", unknown>;
type AuditCapability = Capability<"audit", unknown>;

export namespace Helpers {
	const useRead = (capabilities: Capabilities<ReadCapability>): void => {
		capabilities.read;
	};

	export namespace Nested {
		const useAudit = (capabilities: Capabilities<AuditCapability>): void => {
			capabilities.audit;
		};

		export const useWrite = (
			capabilities: Capabilities<AuditCapability | ReadCapability | WriteCapability>,
		): void => {
			useAudit(capabilities);
			useRead(capabilities);
			capabilities.write;
		};
	}
}

export const run = (
	capabilities: Capabilities<AuditCapability | ReadCapability | WriteCapability>,
): void => {
	capabilities.read;
	Helpers.Nested.useWrite(capabilities);
};
