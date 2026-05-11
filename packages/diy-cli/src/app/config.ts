import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { DiySourceConfig } from "../frontend/source-files.ts";

type DiyProject = {
	readonly config: DiySourceConfig;
	readonly cwd: string;
	readonly projectPath: string;
};

export function resolveProjectPath(projectPath: string, cwd: string): string {
	return isAbsolute(projectPath) ? projectPath : join(cwd, projectPath);
}

export async function readDiyProject(projectPath: string): Promise<DiyProject> {
	let contents: string;
	try {
		contents = await readFile(projectPath, "utf8");
	} catch (error) {
		throw new Error(`Failed to read diy.json at ${projectPath}: ${String(error)}`, {
			cause: error,
		});
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(contents);
	} catch (error) {
		throw new Error(`Failed to parse diy.json at ${projectPath}: ${String(error)}`, {
			cause: error,
		});
	}

	return {
		config: parseDiyConfig(parsed),
		cwd: dirname(projectPath),
		projectPath,
	};
}

function parseDiyConfig(value: unknown): DiySourceConfig {
	if (value == null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("diy.json must contain a JSON object.");
	}

	const include = readStringArray(value, "include");
	if (include == null || include.length === 0) {
		throw new Error('diy.json must define a non-empty "include" string array.');
	}

	const ignore = readStringArray(value, "ignore");
	return {
		ignore: ignore ?? [],
		include,
	};
}

function readStringArray(value: object, field: string): readonly string[] | null {
	if (!Object.hasOwn(value, field)) {
		return null;
	}
	const fieldValue = (value as Record<string, unknown>)[field];
	if (!Array.isArray(fieldValue) || fieldValue.some((item) => typeof item !== "string")) {
		throw new Error(`diy.json field "${field}" must be a string array.`);
	}
	return fieldValue;
}

export function resolveDiyProject(projectPath: string, cwd: string): Promise<DiyProject> {
	return readDiyProject(resolve(resolveProjectPath(projectPath, cwd)));
}
