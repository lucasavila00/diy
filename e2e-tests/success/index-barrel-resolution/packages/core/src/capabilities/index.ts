import type { Capability } from "@beff/diy";

export type FooCapability = Capability<"foo", { read(): string }>;
