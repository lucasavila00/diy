import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"read", unknown>;
type WriteCapability = Capability<"write", unknown>;

export namespace Helpers {
	export namespace Nested {
		export const useWrite = (capabilities: Capabilities<WriteCapability>): void => {
			capabilities.write;
		};
	}
}

export const run = (capabilities: Capabilities<ReadCapability | WriteCapability>): void => {
	capabilities.read;
	Helpers.Nested.useWrite(capabilities);
};
