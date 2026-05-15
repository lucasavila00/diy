import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"fs", unknown>;

declare const defaultCapabilities: Capabilities<FsCapability>;
declare function use(value: unknown): void;

export function renamed(svc: Capabilities<FsCapability>): void {
	use(svc);
}

export function second(path: string, capabilities: Capabilities<FsCapability>): void {
	use(path);
	use(capabilities);
}

export function defaulted(capabilities: Capabilities<FsCapability> = defaultCapabilities): void {
	use(capabilities);
}

export function untyped(capabilities: unknown): void {
	use(capabilities);
}
