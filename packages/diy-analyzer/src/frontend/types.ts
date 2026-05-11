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
	readonly reexports: Map<string, ImportedBinding>;
	readonly source: string;
};

export type ParseErrorInfo = {
	readonly column?: number;
	readonly line?: number;
	readonly message: string;
};

export type FunctionInfo = {
	readonly calls: readonly CapabilitiesForwardingCall[];
	readonly declared: ReadonlySet<string>;
	readonly direct: ReadonlySet<string>;
	readonly provideChecks: readonly CapabilitiesProvideCheck[];
	readonly filePath: string;
	readonly forwardsTransformedCapabilities: boolean;
	readonly column: number;
	readonly line: number;
	readonly name: string;
	readonly unsupportedReasons: readonly UnsupportedReason[];
};

export type CapabilitiesForwardingCall = {
	readonly calleeName: string;
	readonly providedType: unknown | null;
};

export type CapabilitiesProvideCheck = {
	readonly column: number;
	readonly extraType: unknown;
	readonly line: number;
};

export type UnsupportedReason =
	| {
			readonly column?: number;
			readonly filePath?: string;
			readonly kind: "capability-resolution";
			readonly line?: number;
			readonly message: string;
			readonly notes?: readonly { readonly kind: "help" | "note"; readonly message: string }[];
	  }
	| {
			readonly kind: "unresolved-forwarding-callee";
			readonly message: "unresolved capabilities forwarding callee";
	  }
	| {
			readonly calleeName: string;
			readonly kind: "unresolved-forwarding-target";
			readonly message: string;
	  };
