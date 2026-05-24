import { Capabilities, type Capability } from "@beff/diy";

type A = Capability<"a", unknown>;
type B = Capability<"b", unknown>;
type C = Capability<"c", unknown>;
type D = Capability<"d", unknown>;
type E = Capability<"e", unknown>;
type F = Capability<"f", unknown>;

function needF(capabilities: Capabilities<F>): void {
	capabilities.f;
}

type Runner = {
	run(options: {
		readonly onJoin?: () => Promise<void>;
		readonly task: () => Promise<void>;
	}): Promise<void>;
};

export class Cache {
	async publicRun(capabilities: Capabilities<A>): Promise<void> {
		return this.#privateRun(capabilities);
	}

	async publicOtherRun(capabilities: Capabilities<B>, other: Cache): Promise<void> {
		return other.#privateOtherRun(capabilities);
	}

	static async publicStaticRun(capabilities: Capabilities<C>): Promise<void> {
		return Cache.#privateStaticRun(capabilities);
	}

	async publicFieldRun(capabilities: Capabilities<D>): Promise<void> {
		return this.#privateFieldRun(capabilities);
	}

	async publicNestedRun(capabilities: Capabilities<E>, runner: Runner): Promise<void> {
		await runner.run({
			onJoin: async () => this.#privateNestedJoin(capabilities),
			task: async () => this.#privateNestedRun(capabilities),
		});
	}

	publicProviderRun(capabilities: Capabilities<never>): void {
		needF(Capabilities.extend(capabilities, this.#privateProviderCapabilities()));
	}

	async #privateRun(capabilities: Capabilities<A>): Promise<void> {
		capabilities.a;
	}

	async #privateOtherRun(capabilities: Capabilities<B>): Promise<void> {
		capabilities.b;
	}

	static async #privateStaticRun(capabilities: Capabilities<C>): Promise<void> {
		capabilities.c;
	}

	readonly #privateFieldRun = async (capabilities: Capabilities<D>): Promise<void> => {
		capabilities.d;
	};

	async #privateNestedRun(capabilities: Capabilities<E>): Promise<void> {
		capabilities.e;
	}

	async #privateNestedJoin(capabilities: Capabilities<E>): Promise<void> {
		capabilities.e;
	}

	#privateProviderCapabilities(): Capabilities<F> {
		return Capabilities.create<F>({ f: {} });
	}
}
