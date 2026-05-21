/**
 * Public API for defining and passing DIY capability bags.
 *
 * @example
 * ```ts
 * import { Capabilities, type Capability } from "@beff/diy";
 *
 * type ClockCapability = Capability<"clock", { now(): Date }>;
 *
 * const capabilities = Capabilities.create<ClockCapability>({
 * 	clock: { now: () => new Date() },
 * });
 * ```
 *
 * @packageDocumentation
 */
export type { Capability } from "./capabilities.ts";
export { Capabilities } from "./capabilities.ts";
