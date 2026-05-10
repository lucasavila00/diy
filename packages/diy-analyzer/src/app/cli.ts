import { formatDiyAnalysis } from "../backend/format.ts";
import { formatDiyModuleGraph } from "../backend/module-graph-format.ts";
import { analyzeDiy } from "./analyze.ts";
import { analyzeDiyModuleGraph } from "./module-graph.ts";

const args = process.argv.slice(2);
const cwd = process.env["INIT_CWD"] ?? process.env["npm_config_local_prefix"] ?? process.cwd();
const graphMode = args[0] === "--graph";
const inputs = graphMode ? args.slice(1) : args;

if (inputs.length === 0) {
	process.stderr.write(
		"Usage: pnpm --filter @q/diy-analyzer run analyze -- [--graph] <paths...>\n",
	);
	process.exitCode = 1;
} else if (graphMode) {
	const analysis = await analyzeDiy(inputs, { cwd });
	if (analysis.unsupported.length > 0 || analysis.violations.length > 0) {
		const output = formatDiyAnalysis(analysis, { cwd });
		if (output.length > 0) {
			process.stderr.write(output);
		}
		process.exitCode = 1;
	} else {
		const graph = await analyzeDiyModuleGraph(inputs, { cwd });
		process.stdout.write(formatDiyModuleGraph(graph, { cwd }));
	}
} else {
	const analysis = await analyzeDiy(inputs, { cwd });
	const output = formatDiyAnalysis(analysis, { cwd });
	if (output.length > 0) {
		process.stderr.write(output);
	}
	if (
		analysis.unsupported.length > 0 ||
		analysis.violations.length > 0 ||
		analysis.findings.length > 0
	) {
		process.exitCode = 1;
	} else {
		process.stdout.write(`DIY analyzer passed: ${analysis.coveredFiles.length} files analyzed.\n`);
	}
}
