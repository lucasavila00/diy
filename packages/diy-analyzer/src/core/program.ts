import { loadResolutionDependencies, ModuleLoader } from "./module-loader.ts";
import { expandSourceFiles } from "./source-files.ts";
import type { DiySourceConfig } from "./source-files.ts";
import type { ModuleInfo } from "./types.ts";

type DiyProgram = {
	readonly coveredFiles: readonly string[];
	readonly loader: ModuleLoader;
	readonly modules: readonly ModuleInfo[];
};

export async function buildDiyProgram(config: DiySourceConfig, cwd: string): Promise<DiyProgram> {
	const coveredFiles = await expandSourceFiles(config, cwd);
	const coveredSet = new Set(coveredFiles);
	const loader = new ModuleLoader(coveredSet);
	for (const filePath of coveredFiles) {
		await loader.load(filePath);
	}
	await loadResolutionDependencies(loader);
	return {
		coveredFiles,
		loader,
		modules: loader.allModules(),
	};
}
