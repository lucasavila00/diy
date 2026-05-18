import { Capabilities, type Capability } from "@beff/diy/capabilities";

type FooCapability = Capability<"foo", { doThing(value: string): string }>;
type BarCapability = Capability<"bar", { compute(value: number): number }>;
type SharedCapability = FooCapability;

export namespace Service {
	type ServiceCapability = FooCapability | BarCapability;
	type ProvidedCapability = BarCapability;
	type ServiceHandler = (capabilities: Capabilities<ServiceCapability>) => string;

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
