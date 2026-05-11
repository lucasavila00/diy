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
	/* c8 ignore next -- command/runtime failures in this CLI are Error objects. */
	if (error instanceof Error) {
		return error.message;
	}
	/* istanbul ignore next -- command/runtime failures in this CLI are Error objects. */
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
				/* c8 ignore next -- non-empty analysis results format to non-empty output. */
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
		/* istanbul ignore next -- fixture harness injects writers to snapshot output. */
		stderr: options.stderr ?? ((value) => void process.stderr.write(value)),
		/* istanbul ignore next -- fixture harness injects writers to snapshot output. */
		stdout: options.stdout ?? ((value) => void process.stdout.write(value)),
	};
	const command = createCommand(io);
	let commandOptions: DiyCliCommandOptions;
	try {
		/* istanbul ignore next -- fixture command tests provide argv explicitly. */
		command.parse(options.argv ?? process.argv.slice(2), { from: "user" });
		const parsed = command.opts<{ readonly graph?: boolean; readonly project: string }>();
		commandOptions = {
			graph: parsed.graph === true,
			project: parsed.project,
		};
	} catch (error) {
		/* c8 ignore next -- Commander parse errors use CommanderError. */
		if (error instanceof CommanderError) {
			return error.exitCode;
		}
		/* istanbul ignore next -- Commander parse errors use CommanderError. */
		/* c8 ignore start -- Commander parse errors use CommanderError. */
		io.stderr(`${formatError(error)}\n`);
		return 1;
		/* c8 ignore stop */
	}

	try {
		return await executeDiyCli(commandOptions, {
			/* c8 ignore next -- fixture command tests pass cwd explicitly. */
			cwd: options.cwd ?? process.cwd(),
			stderr: io.stderr,
			stdout: io.stdout,
		});
	} catch (error) {
		io.stderr(`${formatError(error)}\n`);
		return 1;
	}
}

/* istanbul ignore next -- process entrypoint glue is exercised by package e2e tests. */
/* c8 ignore start -- process entrypoint glue is exercised by package e2e tests. */
export async function runCli(): Promise<void> {
	process.exitCode = await runDiyCli();
}
/* c8 ignore stop */
