let storedCapabilities: unknown;

type Capabilities<T> = {
	readonly __allowed?: T;
	readonly need: (id: string) => unknown;
};
type Capability<Id extends string, _Service> = { readonly id: Id };
type FsCapability = Capability<"core.fs", unknown>;

export function start(capabilities: Capabilities<FsCapability>): void {
	storedCapabilities = capabilities;
	capabilities.need("core.fs");
}

export function readStored(): unknown {
	return storedCapabilities;
}
