// Type-level tests for `Capabilities.extend` and `Capabilities.merge`. Checked by
// `pnpm run typecheck` with and without `exactOptionalPropertyTypes`.
import type { Capability } from "../src/capabilities.ts";
import { Capabilities } from "../src/capabilities.ts";

type ClockCapability = Capability<"clock", { now(): Date }>;
type LoggerCapability = Capability<"logger", { info(message: string): void }>;
type AnyCapability = Capability<string, unknown>;

declare const logging: Capabilities<LoggerCapability>;
declare const openBag: Capabilities<AnyCapability>;
declare const empty: Capabilities<never>;

const clock = { now: () => new Date(0) };
const clocking = Capabilities.create<ClockCapability>({ clock });

export const valid: readonly Capabilities<ClockCapability | LoggerCapability>[] = [
	Capabilities.extend(logging, clocking),
	Capabilities.extend(logging, Capabilities.create<ClockCapability>({ clock })),
	Capabilities.extend<LoggerCapability, ClockCapability>(logging, { clock }),
	Capabilities.merge(logging, clocking),
	Capabilities.merge(clocking, logging, empty),
];

export const extended = Capabilities.extend(logging, clocking);
extended.clock.now();
extended.logger.info("ok");

// A bag with no services is still a concrete set of services.
export const withEmpty: Capabilities<LoggerCapability> = Capabilities.extend(logging, empty);

// The base bag of `extend` may be generic; the added services are concrete.
export function addClock<Allowed extends AnyCapability>(
	capabilities: Capabilities<Allowed>,
): Capabilities<Allowed | ClockCapability> {
	return Capabilities.extend(capabilities, clocking);
}

// @ts-expect-error -- an un-annotated literal has no capability IDs to infer.
Capabilities.extend(logging, { clock });

// @ts-expect-error -- `undefined` must not pass as a service.
Capabilities.extend(logging, { clock: undefined });

// @ts-expect-error -- an open-ended bag would make the result assignable to any bag.
Capabilities.extend(logging, openBag);

// @ts-expect-error -- explicit capability types still check the services.
Capabilities.extend<LoggerCapability, ClockCapability>(logging, { clock: undefined });

// @ts-expect-error -- an un-annotated literal has no capability IDs to infer.
Capabilities.merge(logging, { clock });

// @ts-expect-error -- `undefined` must not pass as a service.
Capabilities.merge(logging, { clock: undefined });

// @ts-expect-error -- every merged bag needs concrete capability IDs.
Capabilities.merge({ clock }, logging);

// @ts-expect-error -- an open-ended bag must not make the result assignable to any bag.
export const fromOpenBag: Capabilities<ClockCapability> = Capabilities.merge(logging, openBag);
