import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readDiyProject, resolveProjectPath } from "../src/app/config.ts";
import { createCase, writeSource } from "./helpers.ts";

describe("DIY project config", () => {
	it("reads include and optional ignore fields", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"diy.json",
			JSON.stringify({
				ignore: ["**/*.gen.ts"],
				include: ["src/**/*.ts"],
			}),
		);

		const project = await readDiyProject(join(root, "diy.json"));

		expect(project.cwd).toBe(root);
		expect(project.config).toEqual({
			ignore: ["**/*.gen.ts"],
			include: ["src/**/*.ts"],
		});
	});

	it("requires a non-empty include array", async () => {
		const root = await createCase();
		await writeSource(root, "diy.json", JSON.stringify({ ignore: ["**/*.ts"] }));

		await expect(readDiyProject(join(root, "diy.json"))).rejects.toThrow(
			'diy.json must define a non-empty "include" string array.',
		);
	});

	it("resolves relative project paths from the CLI cwd", () => {
		expect(resolveProjectPath("config/diy.json", "/repo/app")).toBe("/repo/app/config/diy.json");
	});
});
