import type { Capability } from "@beff/diy";

export type FsCapability = Capability<"core.fs", unknown>;
export type ClockCapability = Capability<"core.clock", unknown>;
export type SpawnCapability = Capability<"core.spawn", unknown>;
