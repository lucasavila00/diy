// @ts-expect-error -- analyzer fixture intentionally checks default imports from diy.
import DiyDefault from "@beff/diy";
import * as DiyNamespace from "@beff/diy";
import { type Capabilities as CapabilitySet, type Capability as DiyCapability } from "@beff/diy";
import type { Capabilities } from "@beff/diy";
import {
	type Capabilities as CapabilityBag,
	type Capability,
	type Capability as DiySubpathCapability,
	Capabilities as DiyCapabilities,
} from "@beff/diy/capabilities";
// @ts-expect-error -- analyzer fixture intentionally checks default imports from diy.
import DiyCapabilitiesDefault from "@beff/diy/capabilities";
import * as DiyCapabilitiesNamespace from "@beff/diy/capabilities";

import type { External as RenamedExternal } from "./external.ts";

type FsCapability = Capability<"fs", unknown>;
type DiyFsCapability = DiyCapability<"diy-fs", unknown>;
type DiySubpathFsCapability = DiySubpathCapability<"diy-subpath-fs", unknown>;
type AppCapabilities = Capabilities<FsCapability>;
type RenamedCapabilities = CapabilitySet<FsCapability>;
type RenamedCapabilitiesFromSubpath = CapabilityBag<FsCapability>;
type AllowedExternalAlias = RenamedExternal;

declare const capabilities: AppCapabilities;
declare const diyCapability: DiyFsCapability;
declare const diySubpathCapability: DiySubpathFsCapability;
declare const renamed: RenamedCapabilities;
declare const renamedFromSubpath: RenamedCapabilitiesFromSubpath;
declare const allowedExternalAlias: AllowedExternalAlias;

void capabilities;
void diyCapability;
void diySubpathCapability;
void renamed;
void renamedFromSubpath;
void allowedExternalAlias;
void DiyDefault;
void DiyNamespace;
void DiyCapabilities;
void DiyCapabilitiesDefault;
void DiyCapabilitiesNamespace;
