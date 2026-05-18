import { Capabilities, type Capability } from "@beff/diy/capabilities";

type FooCapability = Capability<"foo", { doThing(value: string): string }>;
type BarCapability = Capability<"bar", { compute(value: number): number }>;
type SharedCapability = FooCapability;

export namespace Service {
	type ServiceCapability = FooCapability | BarCapability;
	type AliasCapability = ServiceCapability;
	type ProvidedCapability = BarCapability;
	type ServiceHandler = (capabilities: Capabilities<ServiceCapability>) => string;
	type GenericServiceHandler<Allowed extends ServiceCapability> = (
		capabilities: Capabilities<Allowed>,
	) => string;
	type ServiceCallback = (capabilities: Capabilities<ServiceCapability>) => Promise<void>;

	export const helperA = async (
		capabilities: Capabilities<ServiceCapability>,
		x: string,
	): Promise<string> => `${capabilities.foo.doThing(x)}:${capabilities.bar.compute(1)}`;

	export const helperB = async (
		capabilities: Capabilities<ServiceCapability>,
		y: number,
	): Promise<number> => capabilities.bar.compute(y) + capabilities.foo.doThing("b").length;

	export const acceptBar = (capabilities: Capabilities<BarCapability>): number =>
		capabilities.bar.compute(1);

	export const withProvided = (capabilities: Capabilities<FooCapability>): number => {
		capabilities.foo.doThing("provided");
		return acceptBar(
			Capabilities.extend(
				capabilities,
				Capabilities.create<ProvidedCapability>({
					bar: { compute: (value) => value + 1 },
				}),
			),
		);
	};

	export const contextual: ServiceHandler = (capabilities) =>
		`${capabilities.foo.doThing("contextual")}:${capabilities.bar.compute(1)}`;

	export const chainedAlias = (capabilities: Capabilities<AliasCapability>): string =>
		`${capabilities.foo.doThing("chain")}:${capabilities.bar.compute(1)}`;

	export const genericContextual: GenericServiceHandler<ServiceCapability> = (capabilities) =>
		`${capabilities.foo.doThing("generic")}:${capabilities.bar.compute(1)}`;

	export const forwardCallback = async (
		capabilities: Capabilities<ServiceCapability>,
		callback: ServiceCallback,
	): Promise<void> => {
		await callback(capabilities);
	};
}

export namespace Outer {
	type SharedCapability = BarCapability;

	export namespace Inner {
		export const helper = (capabilities: Capabilities<SharedCapability>): number =>
			capabilities.bar.compute(1);
	}
}

export namespace SiblingA {
	type LocalCapability = FooCapability;

	export const helper = (capabilities: Capabilities<LocalCapability>): string =>
		capabilities.foo.doThing("a");
}

export namespace SiblingB {
	type LocalCapability = BarCapability;

	export const helper = (capabilities: Capabilities<LocalCapability>): number =>
		capabilities.bar.compute(1);
}

export namespace ModuleFallback {
	export const helper = (capabilities: Capabilities<SharedCapability>): string =>
		capabilities.foo.doThing("module");
}
