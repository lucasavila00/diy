export type DiyUnusedCapabilityFinding = {
	readonly declared: readonly string[];
	readonly direct: readonly string[];
	readonly filePath: string;
	readonly functionName: string;
	readonly column: number;
	readonly line: number;
	readonly notes?: readonly DiyAnalyzerNote[];
	readonly transitive: readonly string[];
	readonly unused: readonly string[];
};

export type DiyAnalyzerUnsupported = {
	readonly filePath: string;
	readonly column?: number;
	readonly functionName?: string;
	readonly line?: number;
	readonly notes?: readonly DiyAnalyzerNote[];
	readonly reason: string;
};

export type DiyAnalyzerNote = {
	readonly kind: "help" | "note";
	readonly message: string;
};

export type DiyAnalyzerViolation = {
	readonly capabilityIds?: readonly string[];
	readonly filePath: string;
	readonly functionName?: string;
	readonly column?: number;
	readonly line: number;
	readonly name: string;
	readonly notes?: readonly DiyAnalyzerNote[];
	readonly reason: string;
};

export type DiyAnalysis = {
	readonly coveredFiles: readonly string[];
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
};

export type DiyModuleGraph = {
	readonly modules: readonly DiyModuleGraphModule[];
};

export type DiyModuleGraphImport = {
	readonly importedName: string;
	readonly localName: string;
	readonly resolvedPath?: string;
	readonly source: string;
};

export type DiyModuleGraphModule = {
	readonly filePath: string;
	readonly functions: readonly DiyModuleGraphFunction[];
	readonly imports: readonly DiyModuleGraphImport[];
	readonly reportable: boolean;
};

export type DiyModuleGraphFunction = {
	readonly column: number;
	readonly declared: readonly string[];
	readonly direct: readonly string[];
	readonly filePath: string;
	readonly line: number;
	readonly name: string;
	readonly transitive: readonly string[];
	readonly unused: readonly string[];
};

export type AnalyzeOptions = {
	readonly cwd?: string;
};
