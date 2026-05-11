import { Command } from "commander";

import { formatDiyAnalysis } from "../backend/format.ts";
import { formatDiyModuleGraph } from "../backend/module-graph-format.ts";
import { analyzeDiy } from "./analyze.ts";
import { resolveDiyProject } from "./config.ts";
import { analyzeDiyModuleGraph } from "./module-graph.ts";

async function main(): Promise<void> {
	const command = new Command()
		.name("diy-cli")
		.description("Analyze DIY capability usage")
		.option("--graph", "Print a capability module graph")
		.requiredOption("-p, --project <path>", "Path to the diy.json project file")
		.allowExcessArguments(false)
		.parse();
	const options = command.opts<{ readonly graph?: boolean; readonly project: string }>();
	const cwd = process.env["INIT_CWD"] ?? process.env["npm_config_local_prefix"] ?? process.cwd();
	const project = await resolveDiyProject(options.project, cwd);
	const projectCwd = project.cwd;
	const analyzeOptions = { cwd: projectCwd };

	if (options.graph === true) {
		const analysis = await analyzeDiy(project.config, analyzeOptions);
		if (analysis.unsupported.length > 0 || analysis.violations.length > 0) {
			const output = formatDiyAnalysis(analysis, analyzeOptions);
			if (output.length > 0) {
				process.stderr.write(output);
			}
			process.exitCode = 1;
		} else {
			const graph = await analyzeDiyModuleGraph(project.config, analyzeOptions);
			process.stdout.write(formatDiyModuleGraph(graph, analyzeOptions));
		}
		return;
	}

	const analysis = await analyzeDiy(project.config, analyzeOptions);
	const output = formatDiyAnalysis(analysis, analyzeOptions);
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

void main().catch((error: unknown) => {
	if (error instanceof Error) {
		process.stderr.write(`${error.message}\n`);
	} else {
		process.stderr.write(`${String(error)}\n`);
	}
	process.exitCode = 1;
});
