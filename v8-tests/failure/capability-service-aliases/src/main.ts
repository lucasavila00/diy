import type { Capabilities, Capability } from "@beff/diy";

type ClockCapability = Capability<"clock", { now(): Date }>;
type FsCapability = Capability<"fs", { readFile(path: string): string }>;
type ReadIdCapability = Capability<"read-id", { read(): string }>;

declare function use(...values: unknown[]): void;

export function propertyAlias(capabilities: Capabilities<ClockCapability>): Date {
	const clock = capabilities.clock;
	return clock.now();
}

export function elementAlias(capabilities: Capabilities<ClockCapability>): Date {
	const clock = capabilities["clock"];
	return clock.now();
}

export function destructured(capabilities: Capabilities<ClockCapability | FsCapability>): string {
	const { fs } = capabilities;
	return fs.readFile(capabilities.clock.now().toISOString());
}

export function renamedDestructured(
	capabilities: Capabilities<ClockCapability | ReadIdCapability>,
): void {
	const { "read-id": readId, ["clock"]: clock } = capabilities;
	use(readId, clock);
}

export function dynamicDestructured(capabilities: Capabilities<FsCapability>, id: string): void {
	// @ts-expect-error intentionally invalid for analyzer coverage
	const { [id]: fs, ...rest } = capabilities;
	use(fs, rest);
}

export function assignedAlias(capabilities: Capabilities<ClockCapability>): Date {
	let clock: { now(): Date };
	clock = capabilities.clock;
	return clock.now();
}

export function assignedDestructured(
	capabilities: Capabilities<ClockCapability | FsCapability>,
): void {
	let clock: unknown;
	let readFs: unknown;
	let rest: unknown;
	({ clock, fs: readFs, ...rest } = capabilities);
	use(clock, readFs, rest);
}

export function nestedAlias(capabilities: Capabilities<ClockCapability>): () => Date {
	return () => {
		const clock = capabilities.clock;
		return clock.now();
	};
}
