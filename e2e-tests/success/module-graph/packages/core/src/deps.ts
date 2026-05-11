export type Capabilities<T> = {
	readonly __allowed?: T;
	readonly need: (id: string) => unknown;
};
export type Capability<Id extends string, _Service> = { readonly id: Id };
export type ClockCapability = Capability<"core.clock", unknown>;
export type FsCapability = Capability<"core.fs", unknown>;
