declare const serviceType: unique symbol;

export type Capability<Id extends string, Service> = {
	readonly id: Id;
	readonly [serviceType]?: Service;
};

type CapabilityId<T> = T extends Capability<infer Id, unknown> ? Id : never;

type ServiceForId<Allowed, Id extends string> =
	Allowed extends Capability<Id, infer Service> ? Service : never;

type ServiceMap<Allowed extends Capability<string, unknown>> = {
	readonly [Id in CapabilityId<Allowed>]: ServiceForId<Allowed, Id>;
};

export type Capabilities<in Allowed extends Capability<string, unknown>> = ServiceMap<Allowed>;

function create<Allowed extends Capability<string, unknown> = never>(
	serviceMap: ServiceMap<Allowed>,
): Capabilities<Allowed> {
	return serviceMap;
}

function extend<
	Allowed extends Capability<string, unknown>,
	Extra extends Capability<string, unknown>,
>(capabilities: Capabilities<Allowed>, extra: Capabilities<Extra>): Capabilities<Allowed | Extra> {
	// oxlint-disable-next-line local/no-type-assertion
	return { ...capabilities, ...extra } as Capabilities<Allowed | Extra>;
}

function override<Allowed extends Capability<string, unknown>, Replacement extends Allowed>(
	capabilities: Capabilities<Allowed>,
	replacement: Capabilities<Replacement>,
): Capabilities<Allowed> {
	return { ...capabilities, ...replacement };
}

function merge<First extends Capability<string, unknown>>(
	first: Capabilities<First>,
): Capabilities<First>;
function merge<
	First extends Capability<string, unknown>,
	Second extends Capability<string, unknown>,
>(first: Capabilities<First>, second: Capabilities<Second>): Capabilities<First | Second>;
function merge<
	First extends Capability<string, unknown>,
	Second extends Capability<string, unknown>,
	Third extends Capability<string, unknown>,
>(
	first: Capabilities<First>,
	second: Capabilities<Second>,
	third: Capabilities<Third>,
): Capabilities<First | Second | Third>;
function merge<
	First extends Capability<string, unknown>,
	Second extends Capability<string, unknown>,
	Third extends Capability<string, unknown>,
	Fourth extends Capability<string, unknown>,
>(
	first: Capabilities<First>,
	second: Capabilities<Second>,
	third: Capabilities<Third>,
	fourth: Capabilities<Fourth>,
): Capabilities<First | Second | Third | Fourth>;
function merge<
	First extends Capability<string, unknown>,
	Second extends Capability<string, unknown>,
	Third extends Capability<string, unknown>,
	Fourth extends Capability<string, unknown>,
	Fifth extends Capability<string, unknown>,
>(
	first: Capabilities<First>,
	second: Capabilities<Second>,
	third: Capabilities<Third>,
	fourth: Capabilities<Fourth>,
	fifth: Capabilities<Fifth>,
): Capabilities<First | Second | Third | Fourth | Fifth>;
function merge<
	First extends Capability<string, unknown>,
	Second extends Capability<string, unknown>,
	Third extends Capability<string, unknown>,
	Fourth extends Capability<string, unknown>,
	Fifth extends Capability<string, unknown>,
	Sixth extends Capability<string, unknown>,
>(
	first: Capabilities<First>,
	second: Capabilities<Second>,
	third: Capabilities<Third>,
	fourth: Capabilities<Fourth>,
	fifth: Capabilities<Fifth>,
	sixth: Capabilities<Sixth>,
): Capabilities<First | Second | Third | Fourth | Fifth | Sixth>;
function merge<Allowed extends Capability<string, unknown>>(
	...capabilitiesList: readonly Capabilities<Allowed>[]
): Capabilities<Allowed>;
function merge(
	...capabilitiesList: readonly Capabilities<never>[]
): Capabilities<Capability<string, unknown>> {
	// oxlint-disable-next-line local/no-type-assertion
	return Object.assign({}, ...capabilitiesList) as Capabilities<Capability<string, unknown>>;
}

export const Capabilities = {
	create,
	extend,
	merge,
	override,
};
