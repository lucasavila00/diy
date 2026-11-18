import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { SyntaxKind, isTypeAliasDeclaration } from "typescript/unstable/ast";
import type { ImportDeclaration, Node, SourceFile, TypeNode } from "typescript/unstable/ast";
import type { Project } from "typescript/unstable/async";

import type { DiyAnalyzerViolation } from "../model/types.ts";
import { compareStrings } from "../shared/compare.ts";
import { normalizePath } from "../shared/path.ts";
import { lineStarts, literalText } from "./ast-utils.ts";
import type { AnalyzedSourceFile, ImportBinding } from "./native-types.ts";

export async function collectAnalyzedSourceFiles(
	project: Project,
	coveredSet: ReadonlySet<string>,
	cwd: string,
	configPath: string,
	verbose?: (message: string) => void,
): Promise<{
	readonly sourceFiles: readonly AnalyzedSourceFile[];
	readonly unanalyzedFiles: readonly DiyAnalyzerViolation[];
}> {
	const modules: AnalyzedSourceFile[] = [];
	const unanalyzedFiles: DiyAnalyzerViolation[] = [];
	const seen = new Set<string>();
	const queue = Array.from(coveredSet).sort();
	for (let index = 0; index < queue.length; index += 1) {
		/* c8 ignore next -- loop bounds ensure the queue entry exists. */
		const filePath = resolve(queue[index] ?? "");
		if (seen.has(filePath) || shouldSkipSourceFile(filePath)) {
			continue;
		}
		seen.add(filePath);
		// Only covered files reach this point outside cwd: imports are filtered by importedProjectFiles.
		if (!isInsideDirectory(filePath, cwd) && !filePath.includes("/packages/diy/src/")) {
			unanalyzedFiles.push(outsideProjectViolation(filePath));
			continue;
		}
		verbose?.(`loading source file ${relative(cwd, filePath)}`);
		const sourceFile = await project.program.getSourceFile(filePath);
		// Only covered files can be missing: imports are queued after a successful lookup.
		if (sourceFile == null) {
			unanalyzedFiles.push(outsideTsconfigViolation(filePath, cwd, configPath));
			continue;
		}
		/* c8 ignore next -- declaration files are skipped before lookup. */
		if (sourceFile.isDeclarationFile) {
			continue;
		}
		verbose?.(`collecting imports in ${relative(cwd, filePath)}`);
		const imports = collectImports(sourceFile);
		verbose?.(`collecting type aliases in ${relative(cwd, filePath)}`);
		const { typeAliases, unsupportedTypeAliases } = collectTypeAliases(sourceFile);
		verbose?.(`resolving imports in ${relative(cwd, filePath)}`);
		for (const importedPath of await importedProjectFiles(project, sourceFile, cwd)) {
			if (!seen.has(importedPath)) {
				queue.push(importedPath);
			}
		}
		modules.push({
			filePath,
			imports,
			lineStarts: lazyLineStarts(sourceFile.text),
			reportable: coveredSet.has(filePath),
			sourceFile,
			typeAliases,
			unsupportedTypeAliases,
		});
	}
	return {
		sourceFiles: modules.sort((left, right) => compareStrings(left.filePath, right.filePath)),
		unanalyzedFiles,
	};
}

function isInsideDirectory(filePath: string, directory: string): boolean {
	const relativePath = relative(directory, filePath);
	return !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function outsideProjectViolation(filePath: string): DiyAnalyzerViolation {
	return {
		filePath,
		name: "unanalyzed file",
		notes: [
			{
				kind: "help",
				message:
					"move diy.json to a directory that contains every included file, or remove this file from diy.json `include`",
			},
		],
		reason:
			"Matched by diy.json `include`, but outside the diy.json directory, so it was not analyzed.",
	};
}

function outsideTsconfigViolation(
	filePath: string,
	cwd: string,
	configPath: string,
): DiyAnalyzerViolation {
	const tsconfig = normalizePath(relative(cwd, configPath));
	return {
		filePath,
		name: "unanalyzed file",
		notes: [
			{
				kind: "help",
				message: `add this file to \`include\` or \`files\` in ${tsconfig}, or exclude it with diy.json \`ignore\``,
			},
			{
				kind: "note",
				message:
					"DIY uses the nearest tsconfig.json at or above the diy.json directory as-is and does not follow project `references`",
			},
		],
		reason: `Matched by diy.json \`include\`, but not part of the TypeScript project ${tsconfig}, so it was not analyzed.`,
	};
}

function lazyLineStarts(text: string): () => readonly number[] {
	let starts: readonly number[] | null = null;
	return () => {
		starts ??= lineStarts(text);
		return starts;
	};
}

/* c8 ignore start -- skip guards are defensive around checker-provided project imports. */
function shouldSkipSourceFile(filePath: string): boolean {
	return filePath.includes("/node_modules/") || filePath.endsWith(".d.ts");
}
/* c8 ignore stop */

async function importedProjectFiles(
	project: Project,
	sourceFile: SourceFile,
	cwd: string,
): Promise<readonly string[]> {
	const result: string[] = [];
	for (const statement of sourceFile.statements) {
		if (statement.kind !== SyntaxKind.ImportDeclaration) {
			continue;
		}
		const source = literalText((statement as ImportDeclaration).moduleSpecifier);
		if (source == null || !source.startsWith(".")) {
			continue;
		}
		for (const candidate of importCandidates(sourceFile.fileName, source)) {
			const filePath = resolve(candidate);
			if (!isInsideDirectory(filePath, cwd)) {
				continue;
			}
			if ((await project.program.getSourceFile(filePath)) != null) {
				result.push(filePath);
				break;
			}
		}
	}
	return result.sort();
}

function importCandidates(containingFile: string, source: string): readonly string[] {
	const base = resolve(dirname(containingFile), source);
	if (source.endsWith(".ts")) {
		return [base];
	}
	return [`${base}.ts`, join(base, "index.ts")];
}

function collectImports(sourceFile: SourceFile): ReadonlyMap<string, ImportBinding> {
	const imports = new Map<string, ImportBinding>();
	for (const statement of sourceFile.statements) {
		if (statement.kind !== SyntaxKind.ImportDeclaration) {
			continue;
		}
		const node = statement as ImportDeclaration;
		const source = literalText(node.moduleSpecifier);
		const clause = node.importClause;
		if (source == null || clause == null) {
			continue;
		}
		const namedBindings = clause.namedBindings;
		if (namedBindings?.kind === SyntaxKind.NamespaceImport) {
			imports.set(namedBindings.name.text, {
				importedName: "*",
				kind: "namespace",
				source,
			});
			continue;
		}
		if (namedBindings?.kind !== SyntaxKind.NamedImports) {
			continue;
		}
		for (const specifier of namedBindings.elements) {
			const importedName = specifier.propertyName?.text ?? specifier.name.text;
			imports.set(specifier.name.text, {
				importedName,
				kind: "named",
				source,
			});
		}
	}
	return imports;
}

function collectTypeAliases(sourceFile: SourceFile): {
	readonly typeAliases: ReadonlyMap<string, TypeNode>;
	readonly unsupportedTypeAliases: ReadonlyMap<string, "generic" | "nested">;
} {
	const typeAliases = new Map<string, TypeNode>();
	const unsupportedTypeAliases = new Map<string, "generic" | "nested">();
	const visit = (node: Node): void => {
		if (isTypeAliasDeclaration(node)) {
			if (node.parent !== sourceFile) {
				unsupportedTypeAliases.set(node.name.text, "nested");
			} else if (node.typeParameters != null) {
				unsupportedTypeAliases.set(node.name.text, "generic");
			} else {
				typeAliases.set(node.name.text, node.type);
			}
		}
		node.forEachChild(visit);
	};
	visit(sourceFile);
	return { typeAliases, unsupportedTypeAliases };
}

export function localDiyPaths(cwd: string): Record<string, readonly string[]> {
	const packageRoot = findDiyPackageRoot(cwd);
	/* c8 ignore next -- standalone installs resolve @beff/diy through node_modules instead. */
	if (packageRoot == null) {
		return {};
	}
	return {
		"@beff/diy": [join(packageRoot, "src/index.ts")],
		"@beff/diy/capabilities": [join(packageRoot, "src/capabilities.ts")],
	};
}

function findDiyPackageRoot(cwd: string): string | null {
	let current = resolve(cwd);
	while (true) {
		const candidate = join(current, "packages/diy/package.json");
		if (existsSync(candidate)) {
			return join(current, "packages/diy");
		}
		const parent = dirname(current);
		/* c8 ignore next -- repository fixtures are always inside the workspace root. */
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}
