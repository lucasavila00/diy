import { Capabilities } from "@beff/diy";
import type { Capability } from "@beff/diy";

type Clock = { now(): Date };

type LegacyClockCapability = Capability<"legacyClock", Clock>;
type AppClockCapability = Capability<"appClock", Clock>;
type AuditCapability = Capability<"audit", { record(message: string): void }>;

const topLevelServices = {
	legacyClock: {
		now(): Date {
			return new Date(0);
		},
	},
};

const staticRenamedCapabilities = Capabilities.create<AppClockCapability>({appClock: topLevelServices.legacyClock,
});

export function readRenamed(capabilities: Capabilities<AppClockCapability>): Date {
	return capabilities.appClock.now();
}

export function readRenamedWithAudit(
	capabilities: Capabilities<AppClockCapability | AuditCapability>,
): Date {
	capabilities.audit.record("read");
	return capabilities.appClock.now();
}

export function fromStaticProvider(capabilities: Capabilities<AuditCapability>): Date {
	capabilities.audit.record("static");
	return readRenamed(staticRenamedCapabilities);
}

export function fromTopLevelObject(capabilities: Capabilities<AuditCapability>): Date {
	capabilities.audit.record("top-level");
	return readRenamed(
		Capabilities.extend(
			capabilities,
			Capabilities.create<AppClockCapability>({appClock: topLevelServices.legacyClock,
			}),
		),
	);
}

export function fromExistingCapability(capabilities: Capabilities<LegacyClockCapability>): Date {
	return readRenamed(
		Capabilities.extend(
			capabilities,
			Capabilities.create<AppClockCapability>({appClock: capabilities.legacyClock,
			}),
		),
	);
}

export function fromPartialInlineProvide(
	capabilities: Capabilities<LegacyClockCapability | AuditCapability>,
): Date {
	return readRenamedWithAudit(
		Capabilities.extend(
			capabilities,
			Capabilities.create<AppClockCapability>({appClock: capabilities.legacyClock,
			}),
		),
	);
}
