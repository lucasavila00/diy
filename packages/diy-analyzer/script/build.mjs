import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const tinyglobbyCjsPath = join(
	dirname(require.resolve("tinyglobby/package.json")),
	"dist/index.cjs",
);
const outputPath = join(packageRoot, "dist-cli", "cli.js");
const cliOutputPath = resolve(packageRoot, "../diy-cli/dist-cli/cli.js");

await build({
	bundle: true,
	conditions: ["require", "node"],
	entryPoints: [join(packageRoot, "src/app/cli.ts")],
	external: ["@typescript/native-preview", "@typescript/native-preview/*"],
	format: "cjs",
	mainFields: ["main", "module"],
	outfile: outputPath,
	platform: "node",
	plugins: [
		{
			name: "tinyglobby-cjs",
			setup(context) {
				context.onResolve({ filter: /^tinyglobby$/ }, () => ({ path: tinyglobbyCjsPath }));
			},
		},
	],
	target: "node22",
});

await mkdir(dirname(cliOutputPath), { recursive: true });
await cp(outputPath, cliOutputPath);
