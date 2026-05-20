import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { SyntaxKind } from "@typescript/native-preview/unstable/ast";
import type { ImportDeclaration, SourceFile } from "@typescript/native-preview/unstable/ast";
import type { Project } from "@typescript/native-preview/unstable/sync";

import { lineStarts, literalText } from "./ast-utils.ts";
import type { AnalyzedSourceFile, ImportBinding } from "./native-types.ts";

export function collectAnalyzedSourceFiles(
	project: Project,
	coveredSet: ReadonlySet<string>,
	cwd: string,
): readonly AnalyzedSourceFile[] {
	const modules: AnalyzedSourceFile[] = [];
	const seen = new Set<string>();
	const queue = Array.from(new Set([...project.rootFiles, ...coveredSet])).sort();
	for (let index = 0; index < queue.length; index += 1) {
		/* c8 ignore next -- loop bounds ensure the queue entry exists. */
		const filePath = resolve(queue[index] ?? "");
		if (seen.has(filePath) || shouldSkipSourceFile(filePath, cwd)) {
			continue;
		}
		seen.add(filePath);
		const sourceFile = project.program.getSourceFile(filePath);
		/* c8 ignore next -- tsgo omits declaration roots from source-file lookup here. */
		if (sourceFile == null || sourceFile.isDeclarationFile) {
			continue;
		}
		for (const importedPath of importedProjectFiles(project, sourceFile, cwd)) {
			if (!seen.has(importedPath)) {
				queue.push(importedPath);
			}
		}
		modules.push({
			filePath,
			imports: collectImports(sourceFile),
			lineStarts: lineStarts(sourceFile.text),
			reportable: coveredSet.has(filePath),
			sourceFile,
		});
	}
	return modules.sort((left, right) => left.filePath.localeCompare(right.filePath));
}

function shouldSkipSourceFile(filePath: string, cwd: string): boolean {
	return (
		filePath.includes("/node_modules/") ||
		filePath.endsWith(".d.ts") ||
		(!filePath.startsWith(resolve(cwd)) && !filePath.includes("/packages/diy/src/"))
	);
}

function importedProjectFiles(
	project: Project,
	sourceFile: SourceFile,
	cwd: string,
): readonly string[] {
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
			if (!filePath.startsWith(resolve(cwd))) {
				continue;
			}
			if (project.program.getSourceFile(filePath) != null) {
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

export function localDiyPaths(cwd: string): Record<string, readonly string[]> {
	const packageRoot = findDiyPackageRoot(cwd);
	/* c8 ignore next -- standalone installs resolve @beff/diy through node_modules instead. */
	if (packageRoot == null) {
		return {};
	}
	return {
		"@beff/diy": [relative(cwd, join(packageRoot, "src/index.ts"))],
		"@beff/diy/capabilities": [relative(cwd, join(packageRoot, "src/capabilities.ts"))],
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
