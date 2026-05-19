import type { DiyAnalyzerUnsupported } from "../model/types.ts";
import type { ModuleInfo } from "./types.ts";

export function collectParseErrors(
	modules: readonly ModuleInfo[],
): readonly DiyAnalyzerUnsupported[] {
	const unsupported: DiyAnalyzerUnsupported[] = [];
	for (const moduleInfo of modules) {
		for (const parseError of moduleInfo.parseErrors) {
			const item: {
				column?: number;
				filePath: string;
				line?: number;
				reason: string;
			} = {
				filePath: moduleInfo.filePath,
				reason: parseError.message,
			};
			/* c8 ignore next -- Oxc parse errors include label columns for reportable syntax errors. */
			if (parseError.column != null) {
				item.column = parseError.column;
			}
			/* c8 ignore next -- Oxc parse errors include label lines for reportable syntax errors. */
			if (parseError.line != null) {
				item.line = parseError.line;
			}
			unsupported.push(item);
		}
	}
	return unsupported;
}
