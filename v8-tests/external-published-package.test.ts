import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { executeDiyCli } from "../packages/diy-cli/src/cli.ts";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(rootDir, "v8-tests/fixtures/published-package-repro");

type CapturedRun = {
	readonly exitCode: number;
	readonly stderr: string;
	readonly stdout: string;
};

function packDiyPackage(): { readonly cleanup: () => void; readonly tarballPath: string } {
	const packDir = mkdtempSync(join(tmpdir(), "diy-package-pack-"));
	const output = execFileSync("npm", ["pack", "--silent", join(rootDir, "packages/diy")], {
		cwd: packDir,
		encoding: "utf8",
	});
	const tarballName = output.trim().split(/\r?\n/).at(-1);
	if (tarballName == null || tarballName.length === 0) {
		rmSync(packDir, { force: true, recursive: true });
		throw new Error("npm pack did not report a tarball name.");
	}
	return {
		cleanup: () => rmSync(packDir, { force: true, recursive: true }),
		tarballPath: join(packDir, basename(tarballName)),
	};
}

function createExternalProject(tarballPath: string): {
	readonly cleanup: () => void;
	readonly projectDir: string;
} {
	const projectDir = mkdtempSync(join(tmpdir(), "diy-external-package-"));
	cpSync(fixtureDir, projectDir, { recursive: true });
	writeFileSync(join(projectDir, "diy.json"), '{"include":["src/**/*.ts"]}\n');
	writeFileSync(
		join(projectDir, "package.json"),
		'{"name":"diy-external-package-repro","private":true,"type":"module"}\n',
	);
	writeFileSync(
		join(projectDir, "tsconfig.json"),
		[
			"{",
			'\t"compilerOptions": {',
			'\t\t"allowImportingTsExtensions": true,',
			'\t\t"module": "ESNext",',
			'\t\t"moduleResolution": "Bundler",',
			'\t\t"noEmit": true,',
			'\t\t"strict": true,',
			'\t\t"target": "ES2022",',
			'\t\t"types": []',
			"\t},",
			'\t"include": ["src/**/*.ts"]',
			"}",
			"",
		].join("\n"),
	);
	execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath], {
		cwd: projectDir,
		stdio: "pipe",
	});
	const capabilityPackageDir = join(projectDir, "node_modules/@example/capabilities");
	mkdirSync(capabilityPackageDir, { recursive: true });
	writeFileSync(
		join(capabilityPackageDir, "package.json"),
		'{"name":"@example/capabilities","type":"module","exports":{"types":"./index.d.ts","default":"./index.js"}}\n',
	);
	writeFileSync(
		join(capabilityPackageDir, "index.d.ts"),
		[
			'import type { Capabilities as DiyCapabilities, Capability } from "@beff/diy/capabilities";',
			"export type Capabilities<Allowed extends Capability<string, unknown>> = DiyCapabilities<Allowed>;",
			"export type { Capability };",
			'export type DataCapability = Capability<"data", { db(): Promise<any> }>; ',
			"export type OperationDefinition<G_CAP extends Capability<string, unknown>> = {",
			"\trun(capabilities: Capabilities<G_CAP>, itemIds: readonly unknown[]): Promise<readonly unknown[]>;",
			"};",
			"",
		].join("\n"),
	);
	writeFileSync(join(capabilityPackageDir, "index.js"), "export {};\n");
	return {
		cleanup: () => rmSync(projectDir, { force: true, recursive: true }),
		projectDir,
	};
}

async function runAnalyzerFixture(
	projectDir: string,
	commandOptions: {
		readonly deadCodeAnalysis: boolean;
		readonly graph: boolean;
		readonly project: string;
	},
): Promise<CapturedRun> {
	let stderr = "";
	let stdout = "";
	const exitCode = await executeDiyCli(commandOptions, {
		cwd: projectDir,
		stderr: (value) => {
			stderr += value;
		},
		stdout: (value) => {
			stdout += value;
		},
	});
	return { exitCode, stderr, stdout };
}

describe("DIY external package e2e", () => {
	it("recognizes published @beff/diy Capabilities annotations", async () => {
		// Exercises the real CLI against a temp project that consumes the
		// published package shape through node_modules. The exact native checker
		// fallback contract is covered in analysis/capability-types.test.ts.
		const packed = packDiyPackage();
		const project = createExternalProject(packed.tarballPath);
		try {
			for (const options of [
				{ deadCodeAnalysis: false, graph: false, project: "diy.json" },
				{ deadCodeAnalysis: true, graph: false, project: "diy.json" },
			]) {
				const result = await runAnalyzerFixture(project.projectDir, options);
				expect(result.stderr).toBe("");
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toMatch(/^DIY analyzer passed: \d+ files analyzed\.\n$/);
			}
		} finally {
			project.cleanup();
			packed.cleanup();
		}
	});
});
