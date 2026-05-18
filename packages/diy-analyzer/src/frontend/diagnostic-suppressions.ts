import type { DiyAnalyzerViolation } from "../model/types.ts";
import type { ModuleInfo } from "./types.ts";

export type DiagnosticSuppression = {
	readonly column: number;
	readonly filePath: string;
	readonly line: number;
	readonly targetLine: number;
};

type DiagnosticSuppressions = {
	readonly suppressions: readonly DiagnosticSuppression[];
	readonly violations: readonly DiyAnalyzerViolation[];
};

const directivePattern = /^(\s*)\/\/\s*diy-ignore-next-line\b(.*)$/;

export function collectDiagnosticSuppressions(
	modules: readonly ModuleInfo[],
): DiagnosticSuppressions {
	const suppressions: DiagnosticSuppression[] = [];
	const violations: DiyAnalyzerViolation[] = [];
	for (const moduleInfo of modules) {
		/* c8 ignore next -- ModuleLoader only materializes configured source files. */
		if (!moduleInfo.reportable) {
			continue;
		}
		const lines = moduleInfo.source.split(/\r?\n/);
		for (const [index, lineText] of lines.entries()) {
			const match = directivePattern.exec(lineText);
			if (match == null) {
				continue;
			}
			const indentation = match[1];
			/* c8 ignore next -- directive pattern always captures indentation. */
			if (indentation == null) {
				continue;
			}
			const line = index + 1;
			const column = indentation.length + 1;
			const suffixText = match[2];
			/* c8 ignore next -- directive pattern always captures the suffix. */
			if (suffixText == null) {
				continue;
			}
			const suffix = suffixText.trimStart();
			if (!suffix.startsWith("--") || suffix.slice(2).trim().length === 0) {
				violations.push({
					column,
					filePath: moduleInfo.filePath,
					line,
					name: "invalid diagnostic suppression",
					reason: "`diy-ignore-next-line` requires a non-empty reason after `--`.",
				});
				continue;
			}
			suppressions.push({
				column,
				filePath: moduleInfo.filePath,
				line,
				targetLine: line + 1,
			});
		}
	}
	return { suppressions, violations };
}
