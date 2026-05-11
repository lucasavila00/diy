import type { UnsupportedReason } from "../frontend/types.ts";
import type { ArenaFunction, FunctionIndex, MiddleEndArena } from "./arena.ts";
import type { DiyAnalyzerNote, DiyAnalyzerUnsupported } from "./types.ts";

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
					makeUnsupported(functionInfo, unresolvedForwardingTargetReason(call.calleeName)),
				);
			}
		}
	}
	return { unsupported, unsupportedFunctionIndices };
}

function makeUnsupported(
	functionInfo: ArenaFunction,
	reason: UnsupportedReason,
): DiyAnalyzerUnsupported {
	const notes = unsupportedNotes(reason);
	return {
		column: functionInfo.column,
		filePath: functionInfo.filePath,
		functionName: functionInfo.name,
		line: functionInfo.line,
		...(notes == null ? {} : { notes }),
		reason: reason.message,
	};
}

function unresolvedForwardingTargetReason(calleeName: string): UnsupportedReason {
	return {
		calleeName,
		kind: "unresolved-forwarding-target",
		message: `unresolved capabilities forwarding target ${calleeName}`,
	};
}

function unsupportedNotes(reason: UnsupportedReason): readonly DiyAnalyzerNote[] | undefined {
	switch (reason.kind) {
		case "capability-resolution":
			return undefined;
		case "unresolved-forwarding-callee":
			return [
				{
					kind: "help",
					message:
						"replace the dynamic callee with a named effectful function call, for example `run(capabilities)`",
				},
			];
		case "unresolved-forwarding-target":
			return [
				{
					kind: "help",
					message:
						"make the callee a local or imported function with `capabilities: Capabilities<...>` as its first parameter",
				},
			];
	}
	return assertNever(reason);
}

function assertNever(value: never): never {
	throw new Error(`Unhandled unsupported reason: ${String(value)}`);
}
