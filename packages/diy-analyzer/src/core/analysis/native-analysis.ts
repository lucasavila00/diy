import type {
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyModuleGraph,
	DiyModuleGraphModule,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";
import { compareAnalyzedCapabilityFunctions } from "./capability-functions.ts";
import {
	buildCheckerAnalysisProgramFromFiles,
	closeCheckerAnalysisProgram,
} from "./checker-program.ts";
import { analyzeNativeDiySyntax, collectNativeParseErrors } from "./native-syntax-rules.ts";
import type { AnalyzedCapabilityFunction, CheckerAnalysisProgram } from "./native-types.ts";
import {
	collectProviderViolations,
	collectUnsupported,
	collectUnusedFindings,
	computeRequiredCapabilityIds,
	graphFunction,
} from "./results.ts";
import { timeDeadCodePhase } from "./timing.ts";

export async function analyzeNativeDeadCodeFromFiles(
	coveredFiles: readonly string[],
	cwd: string,
	options: { readonly graph?: boolean } = {},
): Promise<{
	readonly coveredFiles: readonly string[];
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly graph?: DiyModuleGraph;
	readonly suppressions: CheckerAnalysisProgram["suppressions"];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
}> {
	const program = await buildCheckerAnalysisProgramFromFiles(coveredFiles, cwd);
	return analyzeNativeDeadCodeProgram(program, options);
}

function analyzeNativeDeadCodeProgram(
	program: CheckerAnalysisProgram,
	options: { readonly graph?: boolean },
): {
	readonly coveredFiles: readonly string[];
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly graph?: DiyModuleGraph;
	readonly suppressions: CheckerAnalysisProgram["suppressions"];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
} {
	try {
		const required = timeDeadCodePhase("compute required capabilities", () =>
			computeRequiredCapabilityIds(program.analyzedFunctions),
		);
		return {
			coveredFiles: program.coveredFiles,
			findings: timeDeadCodePhase("collect unused findings", () =>
				collectUnusedFindings(program.analyzedFunctions, required),
			),
			...(options.graph === true
				? { graph: timeDeadCodePhase("module graph", () => moduleGraph(program, required)) }
				: {}),
			suppressions: program.suppressions,
			unsupported: timeDeadCodePhase("collect unsupported analysis", () => [
				...collectNativeParseErrors(program.project, program.sourceFiles),
				...collectUnsupported(program.analyzedFunctions),
			]),
			violations: timeDeadCodePhase("collect violations", () => [
				...analyzeNativeDiySyntax(program.project, program.sourceFiles),
				...collectProviderViolations(program.analyzedFunctions),
			]),
		};
	} finally {
		closeCheckerAnalysisProgram(program);
	}
}

function moduleGraph(
	program: CheckerAnalysisProgram,
	required = computeRequiredCapabilityIds(program.analyzedFunctions),
): DiyModuleGraph {
	const functionsByPath = new Map<
		string,
		[AnalyzedCapabilityFunction, ...AnalyzedCapabilityFunction[]]
	>();
	for (const analyzedFunction of program.analyzedFunctions) {
		const functions = functionsByPath.get(analyzedFunction.filePath);
		if (functions == null) {
			functionsByPath.set(analyzedFunction.filePath, [analyzedFunction]);
		} else {
			functions.push(analyzedFunction);
		}
	}

	const modules: DiyModuleGraphModule[] = [];
	for (const [filePath, functions] of functionsByPath) {
		modules.push({
			filePath,
			functions: functions
				.slice()
				.sort(compareAnalyzedCapabilityFunctions)
				.map((analyzedFunction) => graphFunction(analyzedFunction, required)),
		});
	}
	return {
		modules: modules.sort((left, right) => left.filePath.localeCompare(right.filePath)),
	};
}
