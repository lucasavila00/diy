/* c8 ignore start -- tsgo/native-preview behavior is covered through CLI fixtures; line coverage on checker fallback branches is not stable enough to be useful. */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { API } from "@typescript/native-preview/unstable/sync";

import type { DiagnosticSuppression } from "../core/diagnostic-suppressions.ts";
import { expandSourceFiles } from "../core/source-files.ts";
import type { DiySourceConfig } from "../core/source-files.ts";
import type { DiyAnalyzerViolation } from "../model/types.ts";
import { collectAnalyzedCapabilityFunctions } from "./capability-functions.ts";
import type { AnalyzedSourceFile, CheckerAnalysisProgram } from "./native-types.ts";
import { collectAnalyzedSourceFiles, localDiyPaths } from "./source-files.ts";

export async function buildCheckerAnalysisProgram(
	config: DiySourceConfig,
	cwd: string,
): Promise<CheckerAnalysisProgram> {
	const coveredFiles = await expandSourceFiles(config, cwd);
	const coveredSet = new Set(coveredFiles);
	const configInfo = resolveProjectConfig(cwd, coveredFiles);
	const api = new API({
		cwd,
		...(configInfo.configContent == null
			? {}
			: {
					fs: {
						fileExists: (fileName) => (fileName === configInfo.configPath ? true : undefined),
						readFile: (fileName) =>
							fileName === configInfo.configPath ? configInfo.configContent : undefined,
					},
				}),
	});
	try {
		const snapshot = api.updateSnapshot({ openProject: configInfo.configPath });
		const project = snapshot.getProject(configInfo.configPath);
		if (project == null) {
			throw new Error(`Failed to open TypeScript project ${configInfo.configPath}.`);
		}
		const sourceFiles = collectAnalyzedSourceFiles(project, coveredSet, cwd);
		return {
			analyzedFunctions: collectAnalyzedCapabilityFunctions(project, sourceFiles),
			api,
			coveredFiles,
			project,
			suppressions: collectNativeSuppressions(
				sourceFiles.filter((sourceFile) => sourceFile.reportable),
			),
		};
	} catch (error) {
		api.close();
		throw error;
	}
}

export function closeCheckerAnalysisProgram(program: CheckerAnalysisProgram): void {
	program.api.close();
}

function resolveProjectConfig(
	cwd: string,
	coveredFiles: readonly string[],
): { readonly configContent: string | null; readonly configPath: string } {
	const tsconfigPath = findConfigFile(cwd);
	if (tsconfigPath != null) {
		return { configContent: null, configPath: tsconfigPath };
	}
	const configPath = join(cwd, ".diy-tsgo.tsconfig.json");
	return {
		configContent: `${JSON.stringify(
			{
				compilerOptions: {
					allowImportingTsExtensions: true,
					baseUrl: cwd,
					module: "NodeNext",
					moduleResolution: "NodeNext",
					noEmit: true,
					paths: localDiyPaths(cwd),
					strict: true,
					target: "ES2022",
					types: [],
				},
				files: coveredFiles,
			},
			null,
			"\t",
		)}\n`,
		configPath,
	};
}

function findConfigFile(startDir: string): string | null {
	let current = resolve(startDir);
	while (true) {
		const candidate = join(current, "tsconfig.json");
		if (existsSync(candidate)) {
			return candidate;
		}
		const parent = dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

function collectNativeSuppressions(modules: readonly AnalyzedSourceFile[]): {
	readonly suppressions: readonly DiagnosticSuppression[];
	readonly violations: readonly DiyAnalyzerViolation[];
} {
	const suppressions: DiagnosticSuppression[] = [];
	const violations: DiyAnalyzerViolation[] = [];
	const directivePattern = /^(\s*)\/\/\s*diy-ignore-next-line\b(.*)$/;
	for (const sourceFile of modules) {
		const lines = sourceFile.sourceFile.text.split(/\r?\n/);
		for (const [index, lineText] of lines.entries()) {
			const match = directivePattern.exec(lineText);
			if (match == null) {
				continue;
			}
			const line = index + 1;
			const column = (match[1]?.length ?? 0) + 1;
			const suffix = match[2]?.trimStart() ?? "";
			if (!suffix.startsWith("--") || suffix.slice(2).trim().length === 0) {
				violations.push({
					column,
					filePath: sourceFile.filePath,
					line,
					name: "invalid diagnostic suppression",
					reason: "`diy-ignore-next-line` requires a non-empty reason after `--`.",
				});
				continue;
			}
			suppressions.push({
				column,
				filePath: sourceFile.filePath,
				line,
				targetLine: line + 1,
			});
		}
	}
	return { suppressions, violations };
}

/* c8 ignore stop */
