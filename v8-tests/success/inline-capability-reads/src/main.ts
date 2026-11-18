import type { Capabilities, Capability } from "@beff/diy";

type ClockCapability = Capability<"clock", { now(): Date }>;
type ProgressLogger = { progress(text: string): void };
type ProgressLoggerCapability = Capability<"progressLogger", ProgressLogger>;

declare function createLabeledLogger(logger: ProgressLogger): ProgressLogger;

function needClock(capabilities: Capabilities<ClockCapability>): Date {
	return capabilities.clock.now();
}

export function inlineReads(
	capabilities: Capabilities<ClockCapability | ProgressLoggerCapability>,
): void {
	const now = capabilities.clock.now();
	const later = capabilities["clock"].now();
	const logger = createLabeledLogger(capabilities.progressLogger);
	capabilities.progressLogger.progress(`${now.toISOString()} ${later.toISOString()}`);
	logger.progress("started");
	needClock(capabilities);
}
