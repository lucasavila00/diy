import type { ArenaFunction, FunctionIndex, MiddleEndArena } from "./arena.ts";
import type { DiyAnalyzerUnsupported } from "./types.ts";

type RequiredCapabilitiesAnalysis = {
	readonly requiredByFunction: readonly ReadonlySet<string>[];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly unsupportedFunctionIndices: ReadonlySet<FunctionIndex>;
};

export function analyzeRequiredCapabilities(arena: MiddleEndArena): RequiredCapabilitiesAnalysis {
	const requiredByFunction = arena.functions.map((functionInfo) => baseRequired(functionInfo));
	let changed = true;
	while (changed) {
		changed = false;
		for (const functionInfo of arena.functions) {
			const required = requiredByFunction[functionInfo.index];
			if (required == null) {
				continue;
			}
			for (const call of functionInfo.calls) {
				if (call.target == null) {
					continue;
				}
				const calleeRequired = requiredByFunction[call.target];
				if (calleeRequired == null) {
					continue;
				}
				for (const id of calleeRequired) {
					if (!required.has(id)) {
						required.add(id);
						changed = true;
					}
				}
			}
		}
	}
	return {
		requiredByFunction,
		...buildUnsupported(arena),
	};
}

function baseRequired(functionInfo: ArenaFunction): Set<string> {
	const required = new Set(functionInfo.direct);
	if (functionInfo.forwardsTransformedCapabilities) {
		for (const id of functionInfo.declared) {
			required.add(id);
		}
	}
	return required;
}

function buildUnsupported(
	arena: MiddleEndArena,
): Pick<RequiredCapabilitiesAnalysis, "unsupported" | "unsupportedFunctionIndices"> {
	const unsupported: DiyAnalyzerUnsupported[] = [];
	const unsupportedFunctionIndices = new Set<FunctionIndex>();
	for (const functionInfo of arena.functions) {
		const moduleInfo = arena.modules[functionInfo.moduleIndex];
		if (moduleInfo == null || !moduleInfo.reportable) {
			continue;
		}
		for (const reason of functionInfo.unsupportedReasons) {
			unsupportedFunctionIndices.add(functionInfo.index);
			unsupported.push(makeUnsupported(functionInfo, reason));
		}
		for (const call of functionInfo.calls) {
			if (call.target == null) {
				unsupportedFunctionIndices.add(functionInfo.index);
				unsupported.push(
					makeUnsupported(
						functionInfo,
						`unresolved capabilities forwarding target ${call.calleeName}`,
					),
				);
			}
		}
	}
	return { unsupported, unsupportedFunctionIndices };
}

function makeUnsupported(functionInfo: ArenaFunction, reason: string): DiyAnalyzerUnsupported {
	return {
		column: functionInfo.column,
		filePath: functionInfo.filePath,
		functionName: functionInfo.name,
		line: functionInfo.line,
		reason,
	};
}
