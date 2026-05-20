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

export type ModuleInfo = {
	readonly body: readonly unknown[];
	readonly filePath: string;
	readonly imports: Map<string, ImportedBinding>;
	readonly lineStarts: readonly number[];
	readonly parseErrors: readonly ParseErrorInfo[];
	readonly reportable: boolean;
	readonly source: string;
};

export type ParseErrorInfo = {
	readonly column?: number;
	readonly line?: number;
	readonly message: string;
};
