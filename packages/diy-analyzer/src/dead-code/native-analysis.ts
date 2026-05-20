import type { DiySourceConfig } from "../core/source-files.ts";
import type {
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyModuleGraph,
	DiyModuleGraphModule,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";
import { compareAnalyzedCapabilityFunctions } from "./capability-functions.ts";
import { buildCheckerAnalysisProgram, closeCheckerAnalysisProgram } from "./checker-program.ts";
import type { AnalyzedCapabilityFunction, CheckerAnalysisProgram } from "./native-types.ts";
import {
	collectProviderViolations,
	collectUnsupported,
	collectUnusedFindings,
	computeRequiredCapabilityIds,
	graphFunction,
} from "./results.ts";

export async function analyzeNativeDeadCode(
	config: DiySourceConfig,
	cwd: string,
): Promise<{
	readonly coveredFiles: readonly string[];
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly suppressions: CheckerAnalysisProgram["suppressions"];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
}> {
	const program = await buildCheckerAnalysisProgram(config, cwd);
	try {
		const required = computeRequiredCapabilityIds(program.analyzedFunctions);
		return {
			coveredFiles: program.coveredFiles,
			findings: collectUnusedFindings(program.analyzedFunctions, required),
			suppressions: program.suppressions,
			unsupported: collectUnsupported(program.analyzedFunctions),
			violations: collectProviderViolations(program.analyzedFunctions),
		};
	} finally {
		closeCheckerAnalysisProgram(program);
	}
}

export async function analyzeNativeModuleGraph(
	config: DiySourceConfig,
	cwd: string,
): Promise<DiyModuleGraph> {
	const program = await buildCheckerAnalysisProgram(config, cwd);
	try {
		return moduleGraph(program);
	} finally {
		closeCheckerAnalysisProgram(program);
	}
}

function moduleGraph(program: CheckerAnalysisProgram): DiyModuleGraph {
	const required = computeRequiredCapabilityIds(program.analyzedFunctions);
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
		const sourceFile = functions[0].sourceFile;
		modules.push({
			filePath,
			functions: functions
				.slice()
				.sort(compareAnalyzedCapabilityFunctions)
				.map((analyzedFunction) => graphFunction(analyzedFunction, required)),
			imports: [],
			reportable: sourceFile.reportable,
		});
	}
	return {
		modules: modules.sort((left, right) => left.filePath.localeCompare(right.filePath)),
	};
}
