import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

declare const save: {
	(capabilities: Capabilities<ReaderCapability>, value: string): void;
	(capabilities: Capabilities<ReaderCapability | WriterCapability>, value: number): void;
};

export function saveNumber(capabilities: Capabilities<ReaderCapability | WriterCapability>): void {
	save(capabilities, 1);
}
