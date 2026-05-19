import type { ModuleLoader } from "../core/module-loader.ts";
import type { ModuleInfo } from "../core/types.ts";
import type {
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";
import type { DeadCodeFactsByPath } from "./types.ts";
import { analyzeUnusedCapabilities } from "./unused-capabilities.ts";

type MiddleEndAnalysis = {
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
};

export function analyzeMiddleEnd(
	loader: ModuleLoader,
	modules: readonly ModuleInfo[],
	factsByPath: DeadCodeFactsByPath,
): MiddleEndAnalysis {
	const findings: DiyUnusedCapabilityFinding[] = [];
	const unsupported: DiyAnalyzerUnsupported[] = [];
	const violations: DiyAnalyzerViolation[] = [];
	const unusedCapabilities = analyzeUnusedCapabilities(loader, modules, factsByPath);
	findings.push(...unusedCapabilities.findings);
	unsupported.push(...unusedCapabilities.unsupported);
	violations.push(...unusedCapabilities.violations);
	return { findings, unsupported, violations };
}
