import type { DiyAnalyzerUnsupported, DiyAnalyzerViolation } from "../middle-end/types.ts";
import { analyzeDiySyntax } from "./syntax-rules.ts";
import type { ModuleLoader } from "./module-loader.ts";
import type { ModuleInfo } from "./types.ts";

type FrontendAnalysis = {
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
};

export function analyzeFrontend(
	loader: ModuleLoader,
	modules: readonly ModuleInfo[],
): FrontendAnalysis {
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
			if (parseError.column != null) {
				item.column = parseError.column;
			}
			if (parseError.line != null) {
				item.line = parseError.line;
			}
			unsupported.push(item);
		}
		if (!moduleInfo.reportable) {
			continue;
		}
		violations.push(...analyzeDiySyntax(loader, moduleInfo));
	}
	return { unsupported, violations };
}
