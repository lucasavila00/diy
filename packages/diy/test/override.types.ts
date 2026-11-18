// Type-level tests for `Capabilities.override`. Checked by `pnpm run typecheck`
// with and without `exactOptionalPropertyTypes`.
import type { Capability } from "../src/capabilities.ts";
import { Capabilities } from "../src/capabilities.ts";

type ClockCapability = Capability<"clock", { now(): Date }>;
type LoggerCapability = Capability<"logger", { info(message: string): void }>;
type MaybeCapability = Capability<"maybe", string | undefined>;

declare const production: Capabilities<ClockCapability | LoggerCapability>;
declare const partial: Partial<Capabilities<ClockCapability>>;
declare const maybe: Capabilities<MaybeCapability>;

const clock = { now: () => new Date(0) };

export const valid: readonly Capabilities<ClockCapability | LoggerCapability>[] = [
	Capabilities.override(production, {}),
	Capabilities.override(production, { clock }),
	Capabilities.override(production, { clock, logger: { info: () => undefined } }),
];

// A service whose type includes `undefined` can still be replaced with `undefined`.
export const validMaybe: Capabilities<MaybeCapability> = Capabilities.override(maybe, {
	maybe: undefined,
});

// @ts-expect-error -- a replacement cannot remove a service the result still provides.
Capabilities.override(production, { clock: undefined });

// @ts-expect-error -- a `Partial` object may hold `undefined` for a provided service.
Capabilities.override(production, partial);

// @ts-expect-error -- only services from the base capabilities can be replaced.
Capabilities.override(production, { fs: {} });

// @ts-expect-error -- replacements must match the service type.
Capabilities.override(production, { clock: { now: () => 0 } });
