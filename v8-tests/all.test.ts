import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
	commandOptions: {
		readonly deadCodeAnalysis: boolean;
		readonly graph: boolean;
		readonly project: string;
	},
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
		return runAnalyzerFixture(caseDir, {
			deadCodeAnalysis: false,
			graph: false,
			project: "diy.json",
		});
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
			const result = await runAnalyzerFixture(caseDir, {
				deadCodeAnalysis: false,
				graph: false,
				project: "diy.json",
			});
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toMatch(/^DIY analyzer passed: \d+ files analyzed\.\n$/);
		});

		it(`${basename(caseDir)} passes dead-code analysis`, async () => {
			const result = await runAnalyzerFixture(caseDir, {
				deadCodeAnalysis: true,
				graph: false,
				project: "diy.json",
			});
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toMatch(/^DIY analyzer passed: \d+ files analyzed\.\n$/);
		});

		it(`${basename(caseDir)} matches module graph`, async () => {
			const result = await runAnalyzerFixture(caseDir, {
				deadCodeAnalysis: true,
				graph: true,
				project: "diy.json",
			});
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

	it("prints verbose analyzer progress", async () => {
		const caseDir = join(v8TestsDir, "success", "typeof-capability");
		const result = await runCliFixture(caseDir, ["--verbose", "-p", "diy.json"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toMatch(/^DIY analyzer passed: \d+ files analyzed\.\n$/);
		expect(result.stderr).toContain("[diy:verbose] expanded ");
		expect(result.stderr).toContain("[diy:verbose] collecting capability functions");
	});

	it("does not traverse tsconfig roots outside diy.json coverage", async () => {
		const caseDir = mkdtempSync(join(v8TestsDir, "tmp-generated-roots-"));
		try {
			mkdirSync(join(caseDir, "generated"));
			mkdirSync(join(caseDir, "src"));
			writeFileSync(
				join(caseDir, "diy.json"),
				`${JSON.stringify(
					{
						ignore: ["generated/**"],
						include: ["src/**/*.ts"],
					},
					null,
					"\t",
				)}\n`,
			);
			writeFileSync(
				join(caseDir, "tsconfig.json"),
				`${JSON.stringify(
					{
						compilerOptions: {
							allowJs: true,
							baseUrl: ".",
							module: "NodeNext",
							moduleResolution: "NodeNext",
							noEmit: true,
							paths: {
								"@beff/diy": ["../../packages/diy/src/index.ts"],
								"@beff/diy/capabilities": ["../../packages/diy/src/capabilities.ts"],
							},
							target: "ES2022",
						},
						include: ["src/**/*.ts", "generated/**/*.js"],
					},
					null,
					"\t",
				)}\n`,
			);
			writeFileSync(join(caseDir, "generated/root.js"), "export const generated = true;\n");
			writeFileSync(
				join(caseDir, "src/main.ts"),
				`import type { Capabilities, Capability } from "@beff/diy";\n\n` +
					`type ReaderCapability = Capability<"reader", { read(): string }>;\n\n` +
					`export function run(capabilities: Capabilities<ReaderCapability>): string {\n` +
					`\treturn capabilities.reader.read();\n` +
					`}\n`,
			);

			const result = await runCliFixture(caseDir, ["--verbose", "-p", "diy.json"]);
			expect(result.exitCode).toBe(0);
			expect(result.stderr).not.toContain("generated/root.js");
			expect(result.stdout).toMatch(/^DIY analyzer passed: 1 files analyzed\.\n$/);
		} finally {
			rmSync(caseDir, { force: true, recursive: true });
		}
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

	it("rejects direct graph analysis with disabled dead-code analysis", async () => {
		const caseDir = join(v8TestsDir, "failure", "declared-more-than-used");
		await expect(
			executeDiyCli(
				{ deadCodeAnalysis: false, graph: true, project: "diy.json" },
				{
					cwd: caseDir,
					stderr: () => {},
					stdout: () => {},
				},
			),
		).rejects.toThrow("Cannot combine --graph and --no-dead-code-analysis.");
	});

	it("runs general analysis before printing the graph", async () => {
		const caseDir = join(v8TestsDir, "failure", "declared-more-than-used");
		const result = await runCliFixture(caseDir, ["--graph", "-p", "diy.json"]);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain('Declares unused capability "writer".');
	});
});
