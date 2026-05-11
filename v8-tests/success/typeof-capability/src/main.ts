import type { Capabilities, Capability } from "@beff/diy";

import { EXTERNAL_REF } from "./constants.ts";

export const LOCAL_REF = "app.local";

type LocalService = { read(): string };
type ExternalService = { read(): string };

type LocalCapability = Capability<typeof LOCAL_REF, LocalService>;
type ExternalCapability = Capability<typeof EXTERNAL_REF, ExternalService>;

export function loadLocal(capabilities: Capabilities<LocalCapability>): string {
	return capabilities.need(LOCAL_REF).read();
}

export function loadExternal(capabilities: Capabilities<ExternalCapability>): string {
	return capabilities.need(EXTERNAL_REF).read();
}
