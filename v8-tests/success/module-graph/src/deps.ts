import type { Capability } from "@beff/diy";

export type ClockCapability = Capability<"core.clock", unknown>;
export type EnvCapability = Capability<"core.env", unknown>;
export type FsCapability = Capability<"core.fs", unknown>;
export type SecretCapability = Capability<"core.secret", unknown>;
