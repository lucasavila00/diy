import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { afterEach } from "vitest";

const tempRoot = resolve(".tmp", "diy-cli-tests");
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
