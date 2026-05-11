import { Command, CommanderError } from "commander";

import { formatDiyAnalysis } from "../backend/format.ts";
import { formatDiyModuleGraph } from "../backend/module-graph-format.ts";
import { analyzeDiy } from "./analyze.ts";
import { resolveDiyProject } from "./config.ts";
import { analyzeDiyModuleGraph } from "./module-graph.ts";

type DiyCliWriter = (value: string) => void;

type DiyCliCommandOptions = {
	readonly graph: boolean;
	readonly project: string;
};

type DiyCliIo = {
	readonly stderr: DiyCliWriter;
	readonly stdout: DiyCliWriter;
};

type RunDiyCliOptions = {
	readonly argv?: readonly string[];
	readonly cwd?: string;
	readonly stderr?: DiyCliWriter;
	readonly stdout?: DiyCliWriter;
};

function createCommand(io: DiyCliIo): Command {
	return new Command()
		.name("diy-cli")
		.description("Analyze DIY capability usage")
		.option("--graph", "Print a capability module graph")
		.requiredOption("-p, --project <path>", "Path to the diy.json project file")
		.allowExcessArguments(false)
		.configureOutput({
			writeErr: io.stderr,
			writeOut: io.stdout,
		})
		.exitOverride();
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export async function executeDiyCli(
	commandOptions: DiyCliCommandOptions,
	options: {
		readonly cwd: string;
		readonly stderr: DiyCliWriter;
		readonly stdout: DiyCliWriter;
	},
): Promise<number> {
	const project = await resolveDiyProject(commandOptions.project, options.cwd);
	const projectCwd = project.cwd;
	const originalCwd = process.cwd();
	process.chdir(projectCwd);
	try {
		const analyzeOptions = { cwd: projectCwd };

		if (commandOptions.graph) {
			const analysis = await analyzeDiy(project.config, analyzeOptions);
			if (analysis.unsupported.length > 0 || analysis.violations.length > 0) {
				const output = formatDiyAnalysis(analysis, analyzeOptions);
				if (output.length > 0) {
					options.stderr(output);
				}
				return 1;
			}

			const graph = await analyzeDiyModuleGraph(project.config, analyzeOptions);
			options.stdout(formatDiyModuleGraph(graph, analyzeOptions));
			return 0;
		}

		const analysis = await analyzeDiy(project.config, analyzeOptions);
		const output = formatDiyAnalysis(analysis, analyzeOptions);
		if (output.length > 0) {
			options.stderr(output);
		}
		if (
			analysis.unsupported.length > 0 ||
			analysis.violations.length > 0 ||
			analysis.findings.length > 0
		) {
			return 1;
		}

		options.stdout(`DIY analyzer passed: ${analysis.coveredFiles.length} files analyzed.\n`);
		return 0;
	} finally {
		process.chdir(originalCwd);
	}
}

export async function runDiyCli(options: RunDiyCliOptions = {}): Promise<number> {
	const io = {
		stderr: options.stderr ?? ((value) => void process.stderr.write(value)),
		stdout: options.stdout ?? ((value) => void process.stdout.write(value)),
	};
	const command = createCommand(io);
	let commandOptions: DiyCliCommandOptions;
	try {
		command.parse(options.argv ?? process.argv.slice(2), { from: "user" });
		const parsed = command.opts<{ readonly graph?: boolean; readonly project: string }>();
		commandOptions = {
			graph: parsed.graph === true,
			project: parsed.project,
		};
	} catch (error) {
		if (error instanceof CommanderError) {
			return error.exitCode;
		}
		io.stderr(`${formatError(error)}\n`);
		return 1;
	}

	try {
		return await executeDiyCli(commandOptions, {
			cwd: options.cwd ?? process.cwd(),
			stderr: io.stderr,
			stdout: io.stdout,
		});
	} catch (error) {
		io.stderr(`${formatError(error)}\n`);
		return 1;
	}
}

export async function runCli(): Promise<void> {
	process.exitCode = await runDiyCli();
}
