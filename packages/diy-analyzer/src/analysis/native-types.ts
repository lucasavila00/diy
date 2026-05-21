import type { FunctionLikeDeclaration, SourceFile } from "@typescript/native-preview/unstable/ast";
import type { API, Project, Symbol as TsgoSymbol } from "@typescript/native-preview/unstable/sync";

import type { DiyAnalyzerViolation } from "../model/types.ts";
import type { DiagnosticSuppression } from "./diagnostic-suppressions.ts";

export type AnalyzedSourceFile = {
	readonly filePath: string;
	readonly imports: ReadonlyMap<string, ImportBinding>;
	readonly lineStarts: () => readonly number[];
	readonly reportable: boolean;
	readonly sourceFile: SourceFile;
};

export type ImportBinding = {
	readonly importedName: string;
	readonly kind: "named" | "namespace";
	readonly source: string;
};

// Mutable analysis state for one function-like declaration with an explicit DIY
// Capabilities<...> first parameter.
export type AnalyzedCapabilityFunction = {
	readonly column: number;
	readonly declaredCapabilityIds: ReadonlySet<string>;
	readonly directCapabilityIds: Set<string>;
	readonly filePath: string;
	readonly forwardedUses: ForwardedCapabilityUse[];
	readonly id: string;
	readonly isGenericDeclaration: boolean;
	readonly isReportable: boolean;
	readonly line: number;
	readonly name: string;
	readonly node: FunctionLikeDeclaration;
	readonly parameterName: string;
	readonly parameterSymbol: TsgoSymbol;
	readonly propagatedCapabilitySources: Map<string | number, ReadonlySet<string>>;
	readonly providerChecks: CapabilityProviderCheck[];
	readonly sourceFile: AnalyzedSourceFile;
	readonly unsupportedReasons: UnsupportedAnalysisReason[];
};

export type ForwardedCapabilityUse = {
	readonly provided: ReadonlySet<string>;
	readonly required: ReadonlySet<string>;
};

export type CapabilityProviderCheck = {
	readonly column: number;
	readonly extra: ReadonlySet<string>;
	readonly line: number;
};

export type ForwardedExpression = {
	readonly provided: ReadonlySet<string>;
};

export type UnsupportedAnalysisReason =
	| {
			readonly column?: number;
			readonly kind: "dynamic-capability-access";
			readonly line?: number;
	  }
	| {
			readonly kind: "generic-direct-read";
	  }
	| {
			readonly kind: "open-capability-bag";
	  }
	| {
			readonly kind: "unresolved-declaration";
	  }
	| {
			readonly kind: "unresolved-forwarding";
	  };

export type NativeSyntaxProgram = {
	readonly api: API;
	readonly coveredFiles: readonly string[];
	readonly project: Project;
	readonly sourceFiles: readonly AnalyzedSourceFile[];
	readonly suppressions: {
		readonly suppressions: readonly DiagnosticSuppression[];
		readonly violations: readonly DiyAnalyzerViolation[];
	};
};

export type CheckerAnalysisProgram = NativeSyntaxProgram & {
	readonly analyzedFunctions: readonly AnalyzedCapabilityFunction[];
};

export const diyImportSources = new Set(["@beff/diy", "@beff/diy/capabilities"]);
