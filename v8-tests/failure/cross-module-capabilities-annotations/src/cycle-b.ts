// @ts-expect-error -- circular re-exports never resolve to DIY Capabilities.
export type { Looped } from "./cycle-a.ts";
