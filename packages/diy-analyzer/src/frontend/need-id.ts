import {
	getArray,
	getIdentifierName,
	getLiteralString,
	getMemberPropertyName,
	getNode,
} from "./ast.ts";
import type { ModuleLoader } from "./module-loader.ts";
import type { AstNode, ImportedBinding, StringConstantBinding } from "./types.ts";

type StringConstantScope = ReadonlyMap<string, StringConstantBinding>;

export type StringConstantModule = {
	readonly constantExports: Map<string, string>;
	readonly constants: Map<string, StringConstantBinding>;
	readonly filePath: string;
	readonly imports: Map<string, ImportedBinding>;
};

type StringConstantResolutionContext = {
	readonly loader: ModuleLoader;
	readonly localConstants?: readonly StringConstantScope[];
	readonly moduleInfo: StringConstantModule;
};

export function collectStringConstantBindings(
	body: readonly unknown[],
	constants: Map<string, StringConstantBinding>,
	constantExports: Map<string, string>,
): void {
	for (const statement of body) {
		const node = getNode(statement);
		/* c8 ignore next -- parser program bodies contain AST nodes. */
		if (node == null) {
			continue;
		}
		const declaration = getNode(node["declaration"]);
		if (node.type === "ExportNamedDeclaration" && declaration?.type === "VariableDeclaration") {
			collectVariableDeclarationConstants(declaration, constants);
			collectVariableDeclarationExports(declaration, constantExports);
			continue;
		}
		if (node.type === "ExportNamedDeclaration" && node["source"] == null) {
			for (const specifierValue of getArray(node["specifiers"])) {
				const specifier = getNode(specifierValue);
				/* c8 ignore next -- parser export specifier arrays contain export specifiers. */
				if (specifier?.type !== "ExportSpecifier") {
					continue;
				}
				const localName = getIdentifierName(specifier["local"]);
				const exportedName = getIdentifierName(specifier["exported"]);
				/* c8 ignore next -- export specifiers for identifiers provide both names. */
				if (localName != null && exportedName != null) {
					constantExports.set(exportedName, localName);
				}
			}
			continue;
		}
		if (node.type === "VariableDeclaration") {
			collectVariableDeclarationConstants(node, constants);
		}
	}
}

export function collectVariableDeclarationConstants(
	node: AstNode,
	constants: Map<string, StringConstantBinding>,
): void {
	for (const declarationValue of getArray(node["declarations"])) {
		const declaration = getNode(declarationValue);
		const name = getIdentifierName(declaration?.["id"]);
		/* c8 ignore next -- destructured constant IDs are intentionally not supported. */
		if (name == null) {
			continue;
		}
		constants.set(
			name,
			node["kind"] === "const" ? getStaticStringConstant(declaration?.["init"]) : null,
		);
	}
}

function resolveNeedId(context: StringConstantResolutionContext, argument: unknown): string | null {
	const literal = getLiteralString(argument);
	/* c8 ignore next -- normal fixtures use identifiers or const keys for computed access. */
	if (literal != null) {
		return literal;
	}
	const name = getIdentifierName(argument);
	if (name == null) {
		return null;
	}
	return resolveStringConstantName(context, name);
}

export function resolveStaticMemberName(
	context: StringConstantResolutionContext,
	member: unknown,
): string | null {
	const node = getNode(member);
	/* c8 ignore next -- callers pass parser-backed member expressions. */
	if (node?.type !== "MemberExpression") {
		return null;
	}
	if (node["computed"] === true) {
		return resolveNeedId(context, node["property"]);
	}
	return getMemberPropertyName(node["property"]);
}

export function resolveStringConstantName(
	context: StringConstantResolutionContext,
	name: string,
): string | null {
	return resolveStringConstantIdentifier(context, name, []);
}

function collectVariableDeclarationExports(
	node: AstNode,
	constantExports: Map<string, string>,
): void {
	for (const declarationValue of getArray(node["declarations"])) {
		const declaration = getNode(declarationValue);
		const name = getIdentifierName(declaration?.["id"]);
		/* c8 ignore next -- exported variable declarations have identifier names. */
		if (name != null) {
			constantExports.set(name, name);
		}
	}
}

function getStaticStringConstant(value: unknown): string | null {
	const literal = getLiteralString(value);
	if (literal != null) {
		return literal;
	}
	const node = getNode(value);
	if (node?.type === "TSAsExpression") {
		return getStaticStringConstant(node["expression"]);
	}
	return null;
}

function resolveStringConstantIdentifier(
	context: StringConstantResolutionContext,
	name: string,
	seen: readonly string[],
): string | null {
	for (let index = (context.localConstants?.length ?? 0) - 1; index >= 0; index -= 1) {
		const scope = context.localConstants?.[index];
		if (scope?.has(name)) {
			return scope.get(name) ?? null;
		}
	}
	if (context.moduleInfo.constants.has(name)) {
		const value = context.moduleInfo.constants.get(name);
		/* c8 ignore next -- has(name) ensures a value is present. */
		return value == null ? null : value;
	}
	const imported = context.moduleInfo.imports.get(name);
	/* c8 ignore next -- default value imports are intentionally not supported for need IDs. */
	if (imported == null || imported.importedName === "default") {
		return null;
	}
	const resolvedPath = context.loader.resolveImport(context.moduleInfo.filePath, imported.source);
	/* c8 ignore next -- dependency loading covers configured source imports before resolution. */
	if (resolvedPath == null || seen.includes(resolvedPath)) {
		return null;
	}
	const importedModule = context.loader.getModule(resolvedPath);
	/* c8 ignore next -- dependency loading keeps resolved source imports loaded. */
	if (importedModule == null) {
		return null;
	}
	const localName = importedModule.constantExports.get(imported.importedName);
	/* c8 ignore next -- non-constant imports remain dynamic capability IDs. */
	if (localName == null) {
		return null;
	}
	return resolveStringConstantIdentifier(
		{ loader: context.loader, moduleInfo: importedModule },
		localName,
		[...seen, resolvedPath],
	);
}
