import type { Capability } from "@beff/diy";

export type AlphaCapability = Capability<"alpha", { read(): string }>;
export type BetaCapability = Capability<"beta", { write(value: string): void }>;
export type DeltaCapability = Capability<"delta", { trace(): void }>;
export type GammaCapability = Capability<"gamma", { run(): string }>;
