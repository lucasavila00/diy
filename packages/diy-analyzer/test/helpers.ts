import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { afterEach } from "vitest";

import { analyzeDiy } from "../src/app/analyze.ts";

const tempRoot = resolve(".tmp", "diy-analyzer-tests");
const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map(async (dir) => rm(dir, { force: true, recursive: true })),
	);
});

export async function createCase(): Promise<string> {
	await mkdir(tempRoot, { recursive: true });
	const dir = await mkdtemp(join(tempRoot, "case-"));
	tempDirs.push(dir);
	return dir;
}

export async function writeSource(root: string, path: string, source: string): Promise<void> {
	const filePath = join(root, path);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, source, "utf8");
}

export async function writeSources(
	root: string,
	sources: Readonly<Record<string, string>>,
): Promise<void> {
	for (const [path, source] of Object.entries(sources).sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		await writeSource(root, path, source);
	}
}

export const packagePrelude = `
type Capabilities<T> = {
	readonly __allowed?: T;
	readonly provide: <U>(serviceMap: Record<string, unknown>) => Capabilities<T | U>;
	readonly need: (id: string) => unknown;
	readonly override: <U>(serviceMap: Record<string, unknown>) => Capabilities<T>;
};
type Capability<Id extends string, Service> = { readonly id: Id };
type FsCapability = Capability<"core.fs", unknown>;
type ClockCapability = Capability<"core.clock", unknown>;
type ModelRootCapability = Capability<"finance-model.modelRootDir", unknown>;
declare function use(value: unknown): void;
`;

export async function analyzePackageSource(source: string) {
	const root = await createCase();
	await writeSource(root, "packages/alpha/src/sample.ts", `${packagePrelude}\n${source}`);
	return {
		analysis: await analyzeDiy(["packages/alpha/src/sample.ts"], { cwd: root }),
		cwd: root,
	};
}
