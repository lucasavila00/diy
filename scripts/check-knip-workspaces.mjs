import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
	const raw = await readFile(join(repoRoot, relativePath), "utf8");
	return JSON.parse(raw);
}

async function pathExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function normalizePath(path) {
	return path.replaceAll("\\", "/").replace(/\/+$/, "");
}

async function readPnpmWorkspacePatterns() {
	const raw = await readFile(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
	const patterns = [];
	let inPackages = false;

	for (const line of raw.split(/\r?\n/)) {
		if (/^\s*packages:\s*$/.test(line)) {
			inPackages = true;
			continue;
		}
		if (!inPackages) {
			continue;
		}
		const match = line.match(/^\s*-\s*["']?([^"']+)["']?\s*$/);
		if (match == null) {
			if (/^\S/.test(line)) {
				inPackages = false;
			}
			continue;
		}
		patterns.push(match[1]);
	}

	if (patterns.length === 0) {
		throw new Error("pnpm-workspace.yaml must define package patterns");
	}

	return patterns;
}

async function expandWorkspacePattern(pattern) {
	if (!pattern.endsWith("/*")) {
		return (await pathExists(join(repoRoot, pattern, "package.json"))) ? [pattern] : [];
	}

	const basePattern = pattern.slice(0, -2);
	const baseDir = join(repoRoot, basePattern);
	if (!(await pathExists(baseDir))) {
		return [];
	}

	const entries = await readdir(baseDir, { withFileTypes: true });
	const workspaces = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const workspacePath = join(basePattern, entry.name);
				return (await pathExists(join(repoRoot, workspacePath, "package.json")))
					? workspacePath
					: null;
			}),
	);
	return workspaces.filter((workspace) => workspace != null);
}

function isIgnored(workspace, ignoredWorkspaces) {
	const workspaceName = workspace.split("/").at(-1);
	return (
		ignoredWorkspaces.has(workspace) ||
		(workspaceName != null && ignoredWorkspaces.has(workspaceName))
	);
}

const knipConfig = await readJson("knip.json");
const workspacePatterns = await readPnpmWorkspacePatterns();
const ignoredWorkspaces = new Set((knipConfig.ignoreWorkspaces ?? []).map(normalizePath));
const configuredWorkspaces = new Set(Object.keys(knipConfig.workspaces ?? {}).map(normalizePath));
const discoveredWorkspaces = new Set(
	(await Promise.all(workspacePatterns.map(expandWorkspacePattern)))
		.flat()
		.map(normalizePath)
		.filter((workspace) => !isIgnored(workspace, ignoredWorkspaces)),
);

const missingWorkspaces = [...discoveredWorkspaces]
	.filter((workspace) => !configuredWorkspaces.has(workspace))
	.sort();
const staleWorkspaces = [...configuredWorkspaces]
	.filter((workspace) => workspace !== "." && !discoveredWorkspaces.has(workspace))
	.sort();

if (missingWorkspaces.length > 0 || staleWorkspaces.length > 0) {
	const messages = [];
	if (missingWorkspaces.length > 0) {
		messages.push(`Missing knip.json workspace entries:\n${missingWorkspaces.join("\n")}`);
	}
	if (staleWorkspaces.length > 0) {
		messages.push(`Stale knip.json workspace entries:\n${staleWorkspaces.join("\n")}`);
	}
	throw new Error(messages.join("\n\n"));
}
