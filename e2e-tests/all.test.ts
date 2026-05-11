import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { executeDiyCli, runDiyCli } from "../packages/diy-analyzer/src/app/cli.ts";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const e2eDir = join(rootDir, "e2e-tests");

type CapturedRun = {
	readonly exitCode: number;
	readonly stderr: string;
	readonly stdout: string;
};

function fixtureDirs(parentDir: string): readonly string[] {
	const entries = readdirSync(parentDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory() && entry.name !== "node_modules")
		.map((entry) => join(parentDir, entry.name))
		.sort();
}

async function runAnalyzerFixture(
	caseDir: string,
	commandOptions: { readonly graph: boolean; readonly project: string },
): Promise<CapturedRun> {
	let stderr = "";
	let stdout = "";
	const exitCode = await executeDiyCli(commandOptions, {
		cwd: caseDir,
		stderr: (value) => {
			stderr += value;
		},
		stdout: (value) => {
			stdout += value;
		},
	});
	return { exitCode, stderr, stdout };
}

async function runCliFixture(caseDir: string, argv: readonly string[]): Promise<CapturedRun> {
	let stderr = "";
	let stdout = "";
	const exitCode = await runDiyCli({
		argv,
		cwd: caseDir,
		stderr: (value) => {
			stderr += value;
		},
		stdout: (value) => {
			stdout += value;
		},
	});
	return { exitCode, stderr, stdout };
}

async function failureRun(caseDir: string): Promise<CapturedRun> {
	const commandPath = join(caseDir, "command.sh");
	let command = "";
	try {
		command = readFileSync(commandPath, "utf8").trim();
	} catch {
		return runAnalyzerFixture(caseDir, { graph: false, project: "diy.json" });
	}

	const marker = "packages/diy-cli/bin/index.js";
	const markerIndex = command.indexOf(marker);
	if (markerIndex < 0) {
		throw new Error(`Unsupported failure e2e command in ${commandPath}: ${command}`);
	}
	const argvText = command.slice(markerIndex + marker.length).trim();
	const argv = argvText.length === 0 ? [] : argvText.split(/\s+/);
	return runCliFixture(caseDir, argv);
}

describe("DIY failure e2e", () => {
	const caseDirs = fixtureDirs(join(e2eDir, "failure"));

	for (const caseDir of caseDirs) {
		it(`${basename(caseDir)} fails with expected output`, async () => {
			const result = await failureRun(caseDir);
			expect(result.exitCode).toBe(1);
			await expect(result.stdout).toMatchFileSnapshot(join(caseDir, "stdout.txt"));
			await expect(result.stderr).toMatchFileSnapshot(join(caseDir, "stderr.txt"));
		});
	}
});

describe("DIY success e2e", () => {
	const caseDirs = fixtureDirs(join(e2eDir, "success"));

	for (const caseDir of caseDirs) {
		it(`${basename(caseDir)} passes`, async () => {
			const result = await runAnalyzerFixture(caseDir, { graph: false, project: "diy.json" });
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toMatch(/^DIY analyzer passed: \d+ files analyzed\.\n$/);
		});

		it(`${basename(caseDir)} matches module graph`, async () => {
			const result = await runAnalyzerFixture(caseDir, { graph: true, project: "diy.json" });
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			await expect(result.stdout).toMatchFileSnapshot(join(caseDir, "module-graph.txt"));
		});
	}
});
