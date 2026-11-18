import type { ReaderCapability } from "./caps.ts";
import type { Capabilities } from "./diy.ts";

export function viaBarrel(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities.reader.read();
}
