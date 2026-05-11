import type { Capability } from "@beff/diy/capabilities";
import type { ExternalThing } from "external-package";

export type ClockCapability = Capability<"clock", { now(): Date }>;
export type AuditCapability = Capability<"audit", { record(): string }>;
export type ExternalCapability = Capability<"external", { get(): ExternalThing }>;
export type StoreCapability = Capability<"store", { read(): string }>;
