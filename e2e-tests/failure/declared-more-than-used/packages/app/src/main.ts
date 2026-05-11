type Capabilities<T> = {
	readonly __allowed?: T;
	readonly need: (id: string) => unknown;
};
type Capability<Id extends string, _Service> = { readonly id: Id };
type ReadCapability = Capability<"core.read", unknown>;
type WriteCapability = Capability<"core.write", unknown>;

export function load(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities.need("core.read");
}
