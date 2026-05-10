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

export class Capabilities<in Allowed extends Capability<string, unknown>> {
	private readonly serviceMap: ServiceMap<Allowed>;

	constructor(serviceMap: ServiceMap<Allowed>) {
		this.serviceMap = serviceMap;
	}

	provide<Extra extends Capability<string, unknown>>(
		serviceMap: ServiceMap<Extra>,
	): Capabilities<Allowed | Extra> {
		return new Capabilities<Allowed | Extra>({ ...this.serviceMap, ...serviceMap });
	}

	need<Id extends CapabilityId<Allowed>>(id: Id): ServiceForId<Allowed, Id> {
		return this.serviceMap[id];
	}

	override<Replacement extends Allowed>(
		serviceMap: ServiceMap<Replacement>,
	): Capabilities<Allowed> {
		return new Capabilities<Allowed>({ ...this.serviceMap, ...serviceMap });
	}

	static merge<First extends Capability<string, unknown>>(
		first: Capabilities<First>,
	): Capabilities<First>;
	static merge<
		First extends Capability<string, unknown>,
		Second extends Capability<string, unknown>,
	>(first: Capabilities<First>, second: Capabilities<Second>): Capabilities<First | Second>;
	static merge<
		First extends Capability<string, unknown>,
		Second extends Capability<string, unknown>,
		Third extends Capability<string, unknown>,
	>(
		first: Capabilities<First>,
		second: Capabilities<Second>,
		third: Capabilities<Third>,
	): Capabilities<First | Second | Third>;
	static merge<
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
	static merge<
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
	static merge<
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
	static merge<Allowed extends Capability<string, unknown>>(
		...capabilitiesList: readonly Capabilities<Allowed>[]
	): Capabilities<Allowed>;
	static merge(
		...capabilitiesList: readonly Capabilities<never>[]
	): Capabilities<Capability<string, unknown>> {
		// oxlint-disable-next-line local/no-type-assertion
		const mergedServiceMap = {} as ServiceMap<Capability<string, unknown>>;
		for (const capabilities of capabilitiesList) {
			Object.assign(mergedServiceMap, capabilities.serviceMap);
		}
		return new Capabilities<Capability<string, unknown>>(mergedServiceMap);
	}

	static provide<Allowed extends Capability<string, unknown> = never>(
		serviceMap: ServiceMap<Allowed>,
	): Capabilities<Allowed> {
		return new Capabilities<Allowed>(serviceMap);
	}
}
