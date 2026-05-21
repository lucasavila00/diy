import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const cliRoot = join(workspaceRoot, "packages/diy-cli");
const analyzerRoot = join(workspaceRoot, "packages/diy-analyzer");
const analyzerRequire = createRequire(join(analyzerRoot, "package.json"));
const tinyglobbyCjsPath = join(
	dirname(analyzerRequire.resolve("tinyglobby/package.json")),
	"dist/index.cjs",
);

await build({
	bundle: true,
	conditions: ["require", "node"],
	entryPoints: [join(cliRoot, "src/cli.ts")],
	external: ["@typescript/native-preview", "@typescript/native-preview/*"],
	format: "cjs",
	mainFields: ["main", "module"],
	outfile: join(cliRoot, "dist-cli/cli.cjs"),
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
