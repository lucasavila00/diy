import type { DiyAnalyzerUnsupported, DiyAnalyzerViolation } from "../middle-end/types.ts";
import { analyzeDiySyntax } from "./syntax-rules.ts";
import type { ModuleInfo } from "./types.ts";

type FrontendAnalysis = {
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
};

export function analyzeFrontend(modules: readonly ModuleInfo[]): FrontendAnalysis {
	const unsupported: DiyAnalyzerUnsupported[] = [];
	const violations: DiyAnalyzerViolation[] = [];
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
		/* istanbul ignore next -- ModuleLoader only materializes configured source files. */
		if (!moduleInfo.reportable) {
			continue;
		}
		violations.push(...analyzeDiySyntax(moduleInfo));
	}
	return { unsupported, violations };
}
