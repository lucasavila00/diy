import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { executeDiyCli, runDiyCli } from "../packages/diy-cli/src/cli.ts";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const v8TestsDir = join(rootDir, "v8-tests");

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
	commandOptions: { readonly mode: "dead-code" | "graph" | "lint"; readonly project: string },
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
		return runAnalyzerFixture(caseDir, { mode: "lint", project: "diy.json" });
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
	const caseDirs = fixtureDirs(join(v8TestsDir, "failure"));

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
	const caseDirs = fixtureDirs(join(v8TestsDir, "success"));

	for (const caseDir of caseDirs) {
		it(`${basename(caseDir)} passes`, async () => {
			const result = await runAnalyzerFixture(caseDir, { mode: "lint", project: "diy.json" });
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toMatch(/^DIY analyzer passed: \d+ files analyzed\.\n$/);
		});

		it(`${basename(caseDir)} passes dead-code analysis`, async () => {
			const result = await runAnalyzerFixture(caseDir, {
				mode: "dead-code",
				project: "diy.json",
			});
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toMatch(/^DIY analyzer passed: \d+ files analyzed\.\n$/);
		});

		it(`${basename(caseDir)} matches module graph`, async () => {
			const result = await runAnalyzerFixture(caseDir, { mode: "graph", project: "diy.json" });
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			await expect(result.stdout).toMatchFileSnapshot(join(caseDir, "module-graph.txt"));
		});
	}
});

describe("DIY CLI mode flags", () => {
	it("runs dead-code analysis by default", async () => {
		const caseDir = join(v8TestsDir, "failure", "declared-more-than-used");
		const result = await runCliFixture(caseDir, ["-p", "diy.json"]);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain('Declares unused capability "writer".');
	});

	it("can disable dead-code analysis", async () => {
		const caseDir = join(v8TestsDir, "failure", "declared-more-than-used");
		const result = await runCliFixture(caseDir, ["--no-dead-code-analysis", "-p", "diy.json"]);
		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toMatch(/^DIY analyzer passed: \d+ files analyzed\.\n$/);
	});

	it("rejects the removed dead-code flag", async () => {
		const result = await runCliFixture(rootDir, ["--dead-code", "-p", "diy.json"]);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("error: unknown option '--dead-code'\n");
	});

	it("rejects graph mode with disabled dead-code analysis", async () => {
		const result = await runCliFixture(rootDir, [
			"--graph",
			"--no-dead-code-analysis",
			"-p",
			"diy.json",
		]);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("Cannot combine --graph and --no-dead-code-analysis.\n");
	});
});

describe("DIY contextual function type edge cases", () => {
	it("handles parenthesized contextual function types", async () => {
		const caseDir = mkdtempSync(join(tmpdir(), "diy-contextual-arrow-"));
		try {
			mkdirSync(join(caseDir, "src"));
			writeFileSync(join(caseDir, "diy.json"), '{"include":["src/**/*.ts"]}\n');
			writeFileSync(
				join(caseDir, "src/main.ts"),
				[
					'import type { Capabilities, Capability } from "@beff/diy";',
					'type ReadCapability = Capability<"read", { read(): string }>; ',
					"export const run: ((capabilities: Capabilities<ReadCapability>) => string) = ",
					"\t(capabilities) => capabilities.read.read();",
					"",
				].join("\n"),
			);

			const result = await runAnalyzerFixture(caseDir, { mode: "lint", project: "diy.json" });
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
		} finally {
			rmSync(caseDir, { force: true, recursive: true });
		}
	});
});
