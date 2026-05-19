import type { AstNode } from "../core/types.ts";
import type { DiyAnalyzerNote } from "../model/types.ts";

export type DeadCodeFactsByPath = ReadonlyMap<string, DeadCodeModuleFacts>;

export type DeadCodeModuleFacts = {
	readonly functionContextualTypes: Map<string, unknown>;
	readonly functionClosureCallbacks: WeakMap<AstNode, ReadonlySet<string>>;
	readonly functionNamespaces: Map<string, string>;
	readonly functionNodes: Map<string, AstNode>;
	readonly functions: Map<string, FunctionInfo>;
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
			readonly notes?: readonly DiyAnalyzerNote[];
	  }
	| {
			readonly kind: "unresolved-forwarding-callee";
			readonly message: "unresolved capabilities forwarding callee";
	  }
	| {
			readonly column?: number;
			readonly kind: "dynamic-capability-access";
			readonly line?: number;
			readonly message: "dynamic capability access";
	  }
	| {
			readonly calleeName: string;
			readonly kind: "unresolved-forwarding-target";
			readonly message: string;
	  };

export type TypeResolution = {
	readonly ids: ReadonlySet<string>;
	readonly opaque: boolean;
	readonly reasons: readonly TypeResolutionReason[];
};

export type TypeResolutionReason = {
	readonly column?: number;
	readonly filePath?: string;
	readonly line?: number;
	readonly message: string;
	readonly notes?: readonly DiyAnalyzerNote[];
};
