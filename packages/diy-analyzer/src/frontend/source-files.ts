import { resolve } from "node:path";

import { glob } from "tinyglobby";

export function normalizePath(filePath: string): string {
	return filePath.replaceAll("\\", "/");
}

export type DiySourceConfig = {
	readonly ignore?: readonly string[];
	readonly include: readonly string[];
};

export async function expandSourceFiles(
	config: DiySourceConfig,
	cwd: string,
): Promise<readonly string[]> {
	const files = new Set<string>();
	for (const match of await glob([...config.include], {
		absolute: true,
		cwd,
		/* c8 ignore next -- config parsing normalizes missing ignore to an empty array. */
		ignore: [...(config.ignore ?? [])],
		onlyFiles: true,
	})) {
		files.add(resolve(match));
	}
	return Array.from(files).sort();
}
