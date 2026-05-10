import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import { glob, isDynamicPattern } from "tinyglobby";

const sourceExtensions = new Set([".ts", ".tsx"]);

const ignoredPathParts = [
	"/node_modules/",
	"/dist/",
	"/coverage/",
	"/.turbo/",
	"/.cache/",
	"/src/beff/generated/",
];

export function normalizePath(filePath: string): string {
	return filePath.replaceAll("\\", "/");
}

function isIgnoredPath(filePath: string): boolean {
	const normalized = normalizePath(filePath);
	return (
		ignoredPathParts.some((part) => normalized.includes(part)) ||
		normalized.endsWith("/routeTree.gen.ts")
	);
}

export function isSourceFile(filePath: string): boolean {
	return sourceExtensions.has(extname(filePath)) && !isIgnoredPath(filePath);
}

export function isPackageSrcFile(filePath: string): boolean {
	return /\/packages\/[^/]+\/src\//.test(normalizePath(filePath));
}

async function collectDirectorySourceFiles(dirPath: string): Promise<readonly string[]> {
	const entries = await readdir(dirPath, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(dirPath, entry.name);
			if (entry.isDirectory()) {
				return collectDirectorySourceFiles(path);
			}
			return entry.isFile() && isSourceFile(path) ? [path] : [];
		}),
	);
	return files.flat();
}

export async function expandInputs(
	inputs: readonly string[],
	cwd: string,
): Promise<readonly string[]> {
	const files = new Set<string>();
	for (const input of inputs) {
		const absoluteInput = resolve(cwd, input);
		if (existsSync(absoluteInput)) {
			const inputStat = await stat(absoluteInput);
			if (inputStat.isDirectory()) {
				for (const filePath of await collectDirectorySourceFiles(absoluteInput)) {
					files.add(resolve(filePath));
				}
				continue;
			}
			if (inputStat.isFile() && isSourceFile(absoluteInput)) {
				files.add(resolve(absoluteInput));
			}
			continue;
		}
		if (!isDynamicPattern(input, { caseSensitiveMatch: true })) {
			continue;
		}
		for (const match of await glob(input, {
			absolute: true,
			cwd,
			ignore: [
				"**/node_modules/**",
				"**/dist/**",
				"**/coverage/**",
				"**/.turbo/**",
				"**/.cache/**",
				"**/src/beff/generated/**",
				"**/routeTree.gen.ts",
			],
			onlyFiles: true,
		})) {
			if (isSourceFile(match)) {
				files.add(resolve(match));
			}
		}
	}
	return Array.from(files).sort();
}
