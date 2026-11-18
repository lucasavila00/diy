import type { Capabilities, Capability } from "@beff/diy";

export type ReaderCapability = Capability<"reader", { read(): string }>;
export type WriterCapability = Capability<"writer", { write(value: string): void }>;
export type AppCaps = Capabilities<ReaderCapability | WriterCapability>;
