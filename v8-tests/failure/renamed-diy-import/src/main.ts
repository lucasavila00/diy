import type { Capabilities as CapabilitySet, Capability } from "@beff/diy";
import type { Capabilities } from "@beff/diy";
import type { Capabilities as CapabilityBag } from "@beff/diy/capabilities";

import type { External as RenamedExternal } from "./external.ts";

type FsCapability = Capability<"fs", unknown>;
type AppCapabilities = Capabilities<FsCapability>;
type RenamedCapabilities = CapabilitySet<FsCapability>;
type RenamedCapabilitiesFromSubpath = CapabilityBag<FsCapability>;
type AllowedExternalAlias = RenamedExternal;

declare const capabilities: AppCapabilities;
declare const renamed: RenamedCapabilities;
declare const renamedFromSubpath: RenamedCapabilitiesFromSubpath;
declare const allowedExternalAlias: AllowedExternalAlias;

void capabilities;
void renamed;
void renamedFromSubpath;
void allowedExternalAlias;
