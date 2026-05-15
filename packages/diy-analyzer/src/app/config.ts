import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { DiySourceConfig } from "../frontend/source-files.ts";

type DiyProject = {
	readonly config: DiySourceConfig;
	readonly cwd: string;
	readonly projectPath: string;
};

function resolveProjectPath(projectPath: string, cwd: string): string {
	/* c8 ignore next -- fixture commands use project paths relative to their case directory. */
	return isAbsolute(projectPath) ? projectPath : join(cwd, projectPath);
}

async function readDiyProject(projectPath: string, displayPath: string): Promise<DiyProject> {
	let contents: string;
	try {
		contents = await readFile(projectPath, "utf8");
	} catch (error) {
		throw new Error(`Failed to read diy.json at ${displayPath}: ${formatReadError(error)}`, {
			cause: error,
		});
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(contents);
	} catch (error) {
		throw new Error(`Failed to parse diy.json at ${displayPath}: ${String(error)}`, {
			cause: error,
		});
	}

	return {
		config: parseDiyConfig(parsed),
		cwd: dirname(projectPath),
		projectPath,
	};
}

function displayProjectPath(projectPath: string, cwd: string): string {
	const relativePath = relative(cwd, projectPath);
	/* c8 ignore next -- fixture commands keep project files under their case directory. */
	return relativePath.startsWith("..") || isAbsolute(relativePath) ? projectPath : relativePath;
}

function formatReadError(error: unknown): string {
	/* c8 ignore next -- fs read failures are Node error objects. */
	if (error == null || typeof error !== "object") {
		/* c8 ignore next -- fs read failures are Node error objects. */
		return String(error);
	}
	/* c8 ignore next -- Node fs errors expose message/code in a stable shape. */
	const code = "code" in error && typeof error.code === "string" ? error.code : null;
	/* c8 ignore next -- fs read failures are Error objects. */
	const rawMessage = error instanceof Error ? error.message : String(error);
	/* c8 ignore next -- Node fs error messages include text before the open path. */
	const message = rawMessage.split(", open ")[0] ?? rawMessage;
	/* c8 ignore next -- Node fs messages already include the error code. */
	if (code == null || message.startsWith(`${code}: `)) {
		return message;
	}
	/* c8 ignore next -- Node fs messages already include the error code. */
	return `${code}: ${message}`;
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
	const resolvedProjectPath = resolve(resolveProjectPath(projectPath, cwd));
	return readDiyProject(resolvedProjectPath, displayProjectPath(resolvedProjectPath, cwd));
}
