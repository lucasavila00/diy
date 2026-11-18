import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

export function load(capabilities: Capabilities<ReaderCapability>, id: string): string;
export function load(capabilities: Capabilities<ReaderCapability>, id: number): string;
export function load(capabilities: Capabilities<ReaderCapability>, id: string | number): string {
	return capabilities.reader.read() + String(id);
}

export declare function external(capabilities: Capabilities<WriterCapability>): void;

export abstract class Job {
	abstract run(capabilities: Capabilities<WriterCapability>): void;
}
