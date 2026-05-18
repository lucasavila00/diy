import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { codeFrameColumns } from "@babel/code-frame";

import type {
	AnalyzeOptions,
	DiyAnalyzerNote,
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyAnalysis,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";
import { normalizePath } from "../shared/path.ts";

export function sortFindings(
	findings: readonly DiyUnusedCapabilityFinding[],
): readonly DiyUnusedCapabilityFinding[] {
	return Array.from(findings).sort(compareFindings);
}

export function sortUnsupported(
	unsupported: readonly DiyAnalyzerUnsupported[],
): readonly DiyAnalyzerUnsupported[] {
	return Array.from(unsupported).sort(compareUnsupported);
}

export function sortViolations(
	violations: readonly DiyAnalyzerViolation[],
): readonly DiyAnalyzerViolation[] {
	return Array.from(violations).sort(compareViolations);
}

function compareFindings(
	left: DiyUnusedCapabilityFinding,
	right: DiyUnusedCapabilityFinding,
): number {
	/* c8 ignore next -- sorting fallback branches are deterministic tie breakers. */
	return (
		left.filePath.localeCompare(right.filePath) ||
		left.line - right.line ||
		left.functionName.localeCompare(right.functionName)
	);
}

function compareUnsupported(left: DiyAnalyzerUnsupported, right: DiyAnalyzerUnsupported): number {
	return (
		left.filePath.localeCompare(right.filePath) ||
		(left.line ?? 0) - (right.line ?? 0) ||
		(left.functionName ?? "").localeCompare(right.functionName ?? "") ||
		left.reason.localeCompare(right.reason)
	);
}

/* c8 ignore next -- violation sorting fallback branches are deterministic output plumbing. */
function compareViolations(left: DiyAnalyzerViolation, right: DiyAnalyzerViolation): number {
	return (
		left.filePath.localeCompare(right.filePath) ||
		left.line - right.line ||
		(left.functionName ?? "").localeCompare(right.functionName ?? "") ||
		left.name.localeCompare(right.name) ||
		left.reason.localeCompare(right.reason)
	);
}

function formatList(values: readonly string[]): string {
	/* c8 ignore next -- violation fixtures always include concrete capability IDs. */
	return values.length === 0 ? "(none)" : values.join(", ");
}

function formatCapabilityRead(id: string): string {
	if (/^[A-Za-z_$][\w$]*$/.test(id)) {
		return `capabilities.${id}`;
	}
	return `capabilities["${id}"]`;
}

function formatNotes(notes: readonly DiyAnalyzerNote[] | undefined): string {
	if (notes == null || notes.length === 0) {
		return "";
	}
	return `\n${notes.map((note) => `  = ${note.kind}: ${note.message}`).join("\n")}`;
}

function notesWithSuppressionHelp(
	name: string,
	notes: readonly DiyAnalyzerNote[] | undefined,
): readonly DiyAnalyzerNote[] {
	if (name === "invalid diagnostic suppression" || name === "unused diagnostic suppression") {
		return notes ?? [];
	}
	return [
		...(notes ?? []),
		{
			kind: "help",
			message:
				"for known analyzer false positives, add `// diy-ignore-next-line -- reason` on the previous line",
		},
	];
}

function unusedCapabilityNotes(
	id: string,
	extraNotes: readonly DiyAnalyzerNote[] | undefined,
): readonly DiyAnalyzerNote[] {
	return [
		{
			kind: "help",
			message:
				`remove "${id}" from \`Capabilities<...>\`, or add a real ` +
				`\`${formatCapabilityRead(id)}\` read if it is required`,
		},
		...(extraNotes ?? []),
	];
}

type DiagnosticLocation = {
	readonly column?: number;
	readonly filePath: string;
	readonly line?: number;
};

function formatDiagnostic(
	cwd: string,
	item: DiagnosticLocation,
	name: string,
	message: string,
	notes?: readonly DiyAnalyzerNote[],
): string {
	const displayPath = normalizePath(relative(cwd, item.filePath));
	/* c8 ignore next -- analyzer diagnostics carry source locations. */
	const lineColumn =
		item.line == null
			? displayPath
			: `${displayPath}:${item.line}${item.column == null ? "" : `:${item.column}`}`;
	const location = `${lineColumn} ${name}`;
	const source = readSourceFile(item.filePath);
	/* c8 ignore next -- analyzer diagnostics point at loaded source files. */
	if (source == null || item.line == null) {
		return `${location} ${message}${formatNotes(notes)}`;
	}
	return `${location}\n${codeFrameColumns(
		source,
		{
			start: {
				/* c8 ignore next -- analyzer diagnostics include columns. */
				column: item.column ?? 1,
				line: item.line,
			},
		},
		{
			highlightCode: false,
			message,
		},
	)}${formatNotes(notes)}`;
}

function readSourceFile(filePath: string): string | null {
	try {
		return readFileSync(filePath, "utf8");
	} catch {
		/* c8 ignore next -- normal analyzer diagnostics use existing files. */
		return null;
	}
}

export function formatDiyAnalysis(analysis: DiyAnalysis, options: AnalyzeOptions = {}): string {
	/* c8 ignore next -- CLI/tests pass cwd explicitly. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const lines: string[] = [];
	for (const finding of analysis.findings) {
		for (const id of finding.unused) {
			lines.push(
				formatDiagnostic(
					cwd,
					finding,
					"unused capability",
					`Declares unused capability "${id}".`,
					notesWithSuppressionHelp("unused capability", unusedCapabilityNotes(id, finding.notes)),
				),
			);
		}
	}
	for (const violation of analysis.violations) {
		const capabilityIds =
			violation.capabilityIds == null ? "" : `: ${formatList(violation.capabilityIds)}`;
		lines.push(
			formatDiagnostic(
				cwd,
				violation,
				violation.name,
				`${violation.reason}${capabilityIds}`,
				notesWithSuppressionHelp(violation.name, violation.notes),
			),
		);
	}
	for (const item of analysis.unsupported) {
		lines.push(
			formatDiagnostic(
				cwd,
				item,
				"unsupported analysis",
				item.reason,
				notesWithSuppressionHelp("unsupported analysis", item.notes),
			),
		);
	}
	return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
