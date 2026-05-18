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
	readonly functionContextualTypes: Map<string, unknown>;
	readonly functionClosureCallbacks: WeakMap<AstNode, ReadonlySet<string>>;
	readonly functionNamespaces: Map<string, string>;
	readonly functionNodes: Map<string, AstNode>;
	readonly functions: Map<string, FunctionInfo>;
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

export type FunctionInfo = {
	readonly calls: readonly CapabilitiesForwardingCall[];
	readonly declaredType: unknown;
	readonly direct: ReadonlySet<string>;
	readonly provideChecks: readonly CapabilitiesProvideCheck[];
	readonly filePath: string;
	readonly forwardsTransformedCapabilities: boolean;
	readonly column: number;
	readonly line: number;
	readonly name: string;
	readonly namespaceName: string | null;
	readonly suppressUnusedCapabilities: boolean;
	readonly typeParameters: ReadonlySet<string>;
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
