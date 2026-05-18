import type { Capability } from "@beff/diy/capabilities";

export type AlphaCapability = Capability<"alpha", { read(): string }>;
export type BetaCapability = Capability<"beta", { write(text: string): void }>;
export type GammaCapability = Capability<"gamma", { run(): string }>;

export type AppToolCapability = AlphaCapability | BetaCapability | GammaCapability;
