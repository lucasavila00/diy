import type { Capabilities, Capability } from "@beff/diy";

import { EXTERNAL_REF } from "./constants.ts";

export const LOCAL_REF = "local";

type LocalService = { read(): string };
type ExternalService = { read(): string };

type LocalCapability = Capability<typeof LOCAL_REF, LocalService>;
type ExternalCapability = Capability<typeof EXTERNAL_REF, ExternalService>;

export function loadLocal(capabilities: Capabilities<LocalCapability>): string {
	return capabilities[LOCAL_REF].read();
}

export function loadExternal(capabilities: Capabilities<ExternalCapability>): string {
	return capabilities[EXTERNAL_REF].read();
}
