import { analyzeDiy } from "@beff/diy-analyzer/src/analysis/analyze.ts";
import {
	flushDeadCodeTimings,
	timeDeadCodePhaseAsync,
} from "@beff/diy-analyzer/src/analysis/timing.ts";
import type { DiyAnalysis, DiyModuleGraph } from "@beff/diy-analyzer/src/model/types.ts";
import { Command, CommanderError } from "commander";

import { resolveDiyProject } from "./config.ts";
import { formatDiyAnalysis } from "./reporting/format.ts";
import { formatDiyModuleGraph } from "./reporting/module-graph-format.ts";

type DiyCliWriter = (value: string) => void;

type DiyCliCommandOptions = {
	readonly deadCodeAnalysis: boolean;
	readonly graph: boolean;
	readonly project: string;
	readonly verbose?: boolean;
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
		.option("--verbose", "Print analyzer progress and full runtime errors")
		.requiredOption("-p, --project <path>", "Path to the diy.json project file")
		.allowExcessArguments(false)
		.configureOutput({
			writeErr: io.stderr,
			writeOut: io.stdout,
		})
		.exitOverride();
}

function formatError(error: unknown, verbose = false): string {
	/* c8 ignore next -- command/runtime failures in this CLI are Error objects. */
	if (error instanceof Error) {
		if (!verbose || error.stack == null) {
			return error.message;
		}
		const cause = error.cause;
		if (cause instanceof Error && cause.stack != null) {
			return `${error.stack}\nCaused by: ${cause.stack}`;
		}
		return error.stack;
	}
	/* c8 ignore next -- command/runtime failures in this CLI are Error objects. */
	return String(error);
}

function isStackOverflow(error: unknown): boolean {
	return error instanceof RangeError && error.message.includes("Maximum call stack size exceeded");
}

function runtimeErrorContext(error: unknown, lastVerboseMessage: string | null): string | null {
	if (!isStackOverflow(error)) {
		return null;
	}
	return [
		"DIY analyzer hit a JavaScript stack overflow while traversing the TypeScript AST.",
		lastVerboseMessage == null ? null : `Last analyzer step: ${lastVerboseMessage}`,
		"Generated or bundled files included by tsconfig.json are common triggers; exclude them from the TypeScript project or from diy.json ignore patterns.",
	]
		.filter((line) => line != null)
		.join("\n");
}

function requireGraph(analysis: DiyAnalysis): DiyModuleGraph {
	if (analysis.graph == null) {
		throw new Error("Graph analysis did not produce a module graph.");
	}
	return analysis.graph;
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
	let lastVerboseMessage: string | null = null;
	const verbose =
		commandOptions.verbose === true
			? (message: string) => {
					lastVerboseMessage = message;
					options.stderr(`[diy:verbose] ${message}\n`);
				}
			: undefined;
	process.chdir(projectCwd);
	try {
		const analysisOptions = {
			cwd: projectCwd,
			deadCodeAnalysis: commandOptions.deadCodeAnalysis,
			graph: commandOptions.graph,
			...(verbose == null ? {} : { verbose }),
		};
		const analysis = await timeDeadCodePhaseAsync("analysis total", () =>
			analyzeDiy(project.config, analysisOptions),
		);
		const output = await timeDeadCodePhaseAsync("format analysis", async () =>
			formatDiyAnalysis(analysis, analysisOptions),
		);
		flushDeadCodeTimings();
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

		const successOutput = commandOptions.graph
			? formatDiyModuleGraph(requireGraph(analysis), analysisOptions)
			: `DIY analyzer passed: ${analysis.coveredFiles.length} files analyzed.\n`;
		options.stdout(successOutput);
		return 0;
	} catch (error) {
		const context = runtimeErrorContext(error, lastVerboseMessage);
		if (context != null) {
			throw new Error(context, { cause: error });
		}
		throw error;
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
			readonly verbose?: boolean;
		}>();
		if (parsed.graph === true && parsed.deadCodeAnalysis === false) {
			throw new Error("Cannot combine --graph and --no-dead-code-analysis.");
		}
		commandOptions = {
			deadCodeAnalysis: parsed.deadCodeAnalysis !== false,
			graph: parsed.graph === true,
			project: parsed.project,
			verbose: parsed.verbose === true,
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
		io.stderr(`${formatError(error, commandOptions.verbose === true)}\n`);
		return 1;
	}
}

/* c8 ignore start -- process entrypoint glue is exercised by package e2e tests. */
export async function runCli(): Promise<void> {
	process.exitCode = await runDiyCli();
}
/* c8 ignore stop */
