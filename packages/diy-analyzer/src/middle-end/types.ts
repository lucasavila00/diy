import type { DiyAnalyzerNote } from "../model/types.ts";

export type TypeResolution = {
	readonly ids: ReadonlySet<string>;
	readonly reasons: readonly TypeResolutionReason[];
};

export type TypeResolutionReason = {
	readonly column?: number;
	readonly filePath?: string;
	readonly line?: number;
	readonly message: string;
	readonly notes?: readonly DiyAnalyzerNote[];
};
