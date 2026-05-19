export type AstNode = Record<string, unknown> & {
	readonly type: string;
	readonly start?: number;
	readonly end?: number;
};

export type ImportedBinding = {
	readonly kind: "named" | "namespace";
	readonly importedName: string;
	readonly source: string;
};

export type StringConstantBinding = string | null;

export type TypeAliasParameter = {
	readonly constraint: unknown | null;
	readonly name: string;
};

export type ModuleInfo = {
	readonly aliases: Map<string, unknown>;
	readonly aliasTypeParameters: Map<string, readonly TypeAliasParameter[]>;
	readonly body: readonly unknown[];
	readonly constantExports: Map<string, string>;
	readonly constants: Map<string, StringConstantBinding>;
	readonly filePath: string;
	readonly imports: Map<string, ImportedBinding>;
	readonly lineStarts: readonly number[];
	readonly namespaceAliases: Map<string, Map<string, unknown>>;
	readonly namespaceAliasTypeParameters: Map<string, Map<string, readonly TypeAliasParameter[]>>;
	readonly parseErrors: readonly ParseErrorInfo[];
	readonly reportable: boolean;
	readonly source: string;
};

export type ParseErrorInfo = {
	readonly column?: number;
	readonly line?: number;
	readonly message: string;
};
