import { Capabilities } from "@beff/diy";
import type { Capability } from "@beff/diy";

type Clock = { now(): Date };

type LegacyClockCapability = Capability<"legacy.clock", Clock>;
type AppClockCapability = Capability<"app.clock", Clock>;
type AuditCapability = Capability<"audit", { record(message: string): void }>;

const topLevelServices = {
	legacyClock: {
		now(): Date {
			return new Date(0);
		},
	},
};

const staticRenamedCapabilities = Capabilities.provide<AppClockCapability>({
	"app.clock": topLevelServices.legacyClock,
});

export function readRenamed(capabilities: Capabilities<AppClockCapability>): Date {
	return capabilities.need("app.clock").now();
}

export function readRenamedWithAudit(
	capabilities: Capabilities<AppClockCapability | AuditCapability>,
): Date {
	capabilities.need("audit").record("read");
	return capabilities.need("app.clock").now();
}

export function fromStaticProvider(capabilities: Capabilities<AuditCapability>): Date {
	capabilities.need("audit").record("static");
	return readRenamed(staticRenamedCapabilities);
}

export function fromTopLevelObject(capabilities: Capabilities<AuditCapability>): Date {
	capabilities.need("audit").record("top-level");
	return readRenamed(
		capabilities.provide<AppClockCapability>({
			"app.clock": topLevelServices.legacyClock,
		}),
	);
}

export function fromExistingCapability(capabilities: Capabilities<LegacyClockCapability>): Date {
	return readRenamed(
		capabilities.provide<AppClockCapability>({
			"app.clock": capabilities.need("legacy.clock"),
		}),
	);
}

export function fromPartialInlineProvide(
	capabilities: Capabilities<LegacyClockCapability | AuditCapability>,
): Date {
	return readRenamedWithAudit(
		capabilities.provide<AppClockCapability>({
			"app.clock": capabilities.need("legacy.clock"),
		}),
	);
}
