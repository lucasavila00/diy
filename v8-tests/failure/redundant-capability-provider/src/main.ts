import { Capabilities, type Capability } from "@beff/diy";

type ReadCapability = Capability<"read", unknown>;
type WriteCapability = Capability<"write", unknown>;

export function load(
	capabilities: Capabilities<ReadCapability | WriteCapability>,
): Capabilities<ReadCapability | WriteCapability> {
	return Capabilities.extend(capabilities, Capabilities.create<WriteCapability>({ write: {} }));
}

export function loadBoth(
	capabilities: Capabilities<ReadCapability | WriteCapability>,
): Capabilities<ReadCapability | WriteCapability> {
	return Capabilities.extend(
		capabilities,
		Capabilities.create<ReadCapability | WriteCapability>({ read: {}, write: {} }),
	);
}
