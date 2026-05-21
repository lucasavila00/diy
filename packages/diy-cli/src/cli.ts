import { analyzeDiyDeadCode } from "@beff/diy-analyzer/src/core/analysis/analyze.ts";
import { analyzeDiyLint } from "@beff/diy-analyzer/src/core/analysis/lint.ts";
import { analyzeDiyModuleGraph } from "@beff/diy-analyzer/src/core/analysis/module-graph.ts";
import {
	flushDeadCodeTimings,
	timeDeadCodePhaseAsync,
} from "@beff/diy-analyzer/src/core/analysis/timing.ts";
import { Command, CommanderError } from "commander";

import { resolveDiyProject } from "./config.ts";
import { formatDiyAnalysis } from "./reporting/format.ts";
import { formatDiyModuleGraph } from "./reporting/module-graph-format.ts";

type DiyCliWriter = (value: string) => void;

type DiyCliMode = "dead-code" | "graph" | "lint";

type DiyCliCommandOptions = {
	readonly mode: DiyCliMode;
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
		.option("--no-dead-code-analysis", "Run syntax lint rules without dead-code analysis")
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
	/* c8 ignore next -- command/runtime failures in this CLI are Error objects. */
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

		if (commandOptions.mode === "graph") {
			const analysis = await analyzeDiyDeadCode(project.config, analyzeOptions);
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

		const analysis =
			commandOptions.mode === "dead-code"
				? await timeDeadCodePhaseAsync("dead-code mode total", () =>
						analyzeDiyDeadCode(project.config, analyzeOptions),
					)
				: await analyzeDiyLint(project.config, analyzeOptions);
		const output =
			commandOptions.mode === "dead-code"
				? await timeDeadCodePhaseAsync("format analysis", async () =>
						formatDiyAnalysis(analysis, analyzeOptions),
					)
				: formatDiyAnalysis(analysis, analyzeOptions);
		if (commandOptions.mode === "dead-code") {
			flushDeadCodeTimings();
		}
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
		/* c8 ignore next -- fixture harness injects writers to snapshot output. */
		stderr: options.stderr ?? ((value) => void process.stderr.write(value)),
		/* c8 ignore next -- fixture harness injects writers to snapshot output. */
		stdout: options.stdout ?? ((value) => void process.stdout.write(value)),
	};
	const command = createCommand(io);
	let commandOptions: DiyCliCommandOptions;
	try {
		/* c8 ignore next -- fixture command tests provide argv explicitly. */
		command.parse(options.argv ?? process.argv.slice(2), { from: "user" });
		const parsed = command.opts<{
			readonly deadCodeAnalysis?: boolean;
			readonly graph?: boolean;
			readonly project: string;
		}>();
		if (parsed.graph === true && parsed.deadCodeAnalysis === false) {
			throw new Error("Cannot combine --graph and --no-dead-code-analysis.");
		}
		commandOptions = {
			mode:
				parsed.graph === true ? "graph" : parsed.deadCodeAnalysis === false ? "lint" : "dead-code",
			project: parsed.project,
		};
	} catch (error) {
		/* c8 ignore next -- Commander parse errors use CommanderError. */
		if (error instanceof CommanderError) {
			return error.exitCode;
		}
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

/* c8 ignore start -- process entrypoint glue is exercised by package e2e tests. */
export async function runCli(): Promise<void> {
	process.exitCode = await runDiyCli();
}
/* c8 ignore stop */
