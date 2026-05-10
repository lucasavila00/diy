export type AstNode = Record<string, unknown> & {
	readonly type: string;
	readonly start?: number;
	readonly end?: number;
};

export type ImportedBinding = {
	readonly importedName: string;
	readonly source: string;
};

export type ModuleInfo = {
	readonly aliases: Map<string, unknown>;
	readonly body: readonly unknown[];
	readonly filePath: string;
	readonly functionNodes: Map<string, AstNode>;
	readonly functions: Map<string, FunctionInfo>;
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

export type FunctionInfo = {
	readonly calleeNames: ReadonlySet<string>;
	readonly declared: ReadonlySet<string>;
	readonly direct: ReadonlySet<string>;
	readonly provideChecks: readonly CapabilitiesProvideCheck[];
	readonly filePath: string;
	readonly forwardsTransformedCapabilities: boolean;
	readonly column: number;
	readonly line: number;
	readonly name: string;
	readonly unsupportedReasons: readonly string[];
};

export type CapabilitiesProvideCheck = {
	readonly column: number;
	readonly extraType: unknown;
	readonly line: number;
};
