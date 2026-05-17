import type { ModuleLoader } from "../frontend/module-loader.ts";
import type { ModuleInfo } from "../frontend/types.ts";
import type {
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";
import { analyzeUnusedCapabilities } from "./unused-capabilities.ts";

type MiddleEndAnalysis = {
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
};

export function analyzeMiddleEnd(
	loader: ModuleLoader,
	modules: readonly ModuleInfo[],
): MiddleEndAnalysis {
	const findings: DiyUnusedCapabilityFinding[] = [];
	const unsupported: DiyAnalyzerUnsupported[] = [];
	const violations: DiyAnalyzerViolation[] = [];
	const unusedCapabilities = analyzeUnusedCapabilities(loader, modules);
	findings.push(...unusedCapabilities.findings);
	unsupported.push(...unusedCapabilities.unsupported);
	violations.push(...unusedCapabilities.violations);
	return { findings, unsupported, violations };
}
