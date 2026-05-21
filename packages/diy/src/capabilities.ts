declare const capabilityId: unique symbol;
declare const serviceType: unique symbol;

/**
 * Define one dependency your code can ask for.
 *
 * @example
 * ```ts
 * import type { Capability } from "@beff/diy";
 *
 * type ClockCapability = Capability<"clock", { now(): Date }>;
 * ```
 *
 * The name `"clock"` becomes `capabilities.clock` when a function receives
 * `Capabilities<ClockCapability>`.
 */
export interface Capability<Id extends string, Service> {
	readonly [capabilityId]: Id;
	readonly [serviceType]: Service;
}

/**
 * Use `Capabilities<...>` as the first parameter of functions that need
 * services.
 *
 * @example
 * ```ts
 * import type { Capabilities, Capability } from "@beff/diy";
 * import type { PathLike } from "node:fs";
 *
 * type ClockCapability = Capability<"clock", { now(): Date }>;
 * type FsCapability = Capability<"fs", { readFile(path: PathLike, encoding: "utf8"): Promise<string> }>;
 *
 * async function readConfig(
 * 	capabilities: Capabilities<ClockCapability | FsCapability>,
 * 	path: PathLike,
 * ): Promise<string> {
 * 	const config = await capabilities.fs.readFile(path, "utf8");
 *
 * 	return `[${capabilities.clock.now().toISOString()}]\n${config}`;
 * }
 * ```
 */
export type Capabilities<in Allowed extends Capability<string, unknown>> = {
	readonly [Single in Allowed as Single[typeof capabilityId]]: Single[typeof serviceType];
};

type ServiceOverrides<Allowed extends Capability<string, unknown>> = Partial<Capabilities<Allowed>>;

function create<Allowed extends Capability<string, unknown> = never>(
	serviceMap: Capabilities<Allowed>,
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

function override<Allowed extends Capability<string, unknown>>(
	capabilities: Capabilities<Allowed>,
	replacement: ServiceOverrides<Allowed>,
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

/**
 * Build and compose DIY capability bags.
 *
 * @example
 * ```ts
 * import { Capabilities, type Capability } from "@beff/diy";
 *
 * type ClockCapability = Capability<"clock", { now(): Date }>;
 * type LoggerCapability = Capability<"logger", { info(message: string): void }>;
 * type AppCapability = ClockCapability | LoggerCapability;
 *
 * const capabilities = Capabilities.create<AppCapability>({
 * 	clock: { now: () => new Date() },
 * 	logger: { info: console.log },
 * });
 * ```
 */
export const Capabilities = {
	/**
	 * Build the app's concrete services.
	 *
	 * @example
	 * ```ts
	 * const capabilities = Capabilities.create<AppCapability>({
	 * 	clock: { now: () => new Date() },
	 * 	fs,
	 * });
	 * ```
	 */
	create,
	/**
	 * Add scoped services around an existing bag.
	 *
	 * @example
	 * ```ts
	 * const jobCapabilities = Capabilities.extend(
	 * 	capabilities,
	 * 	Capabilities.create<ProgressCapability>({ progress }),
	 * );
	 * ```
	 */
	extend,
	/**
	 * Combine capability bags built by separate modules.
	 *
	 * @example
	 * ```ts
	 * const appCapabilities = Capabilities.merge(nodeCapabilities, databaseCapabilities);
	 * ```
	 */
	merge,
	/**
	 * Replace services without changing the capability type.
	 *
	 * @example
	 * ```ts
	 * const quietCapabilities = Capabilities.override(capabilities, {
	 * 	logger: { info: () => undefined },
	 * });
	 * ```
	 */
	override,
};
