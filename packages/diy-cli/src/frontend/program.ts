import { loadResolutionDependencies, ModuleLoader } from "./module-loader.ts";
import { expandInputs } from "./source-files.ts";
import type { ModuleInfo } from "./types.ts";

type DiyProgram = {
	readonly coveredFiles: readonly string[];
	readonly loader: ModuleLoader;
	readonly modules: readonly ModuleInfo[];
};

export async function buildDiyProgram(inputs: readonly string[], cwd: string): Promise<DiyProgram> {
	const coveredFiles = await expandInputs(inputs, cwd);
	const coveredSet = new Set(coveredFiles);
	const loader = new ModuleLoader(cwd, coveredSet);
	for (const filePath of coveredFiles) {
		await loader.load(filePath);
	}
	await loadResolutionDependencies(loader);
	loader.materializeFunctions();
	return {
		coveredFiles,
		loader,
		modules: loader.allModules(),
	};
}
