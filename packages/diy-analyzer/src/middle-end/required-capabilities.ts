import type { ModuleLoader } from "../frontend/module-loader.ts";
import type { UnsupportedReason } from "../frontend/types.ts";
import type { ArenaCall, ArenaFunction, FunctionIndex, MiddleEndArena } from "./arena.ts";
import { resolveCapabilityIds } from "./capabilities.ts";
import type { DiyAnalyzerNote, DiyAnalyzerUnsupported } from "./types.ts";

type RequiredCapabilitiesAnalysis = {
	readonly requiredByFunction: readonly ReadonlySet<string>[];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly unsupportedFunctionIndices: ReadonlySet<FunctionIndex>;
};

export function analyzeRequiredCapabilities(
	loader: ModuleLoader,
	arena: MiddleEndArena,
): RequiredCapabilitiesAnalysis {
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
				const provided = resolveProvidedCapabilities(loader, arena, functionInfo, call);
				for (const id of calleeRequired) {
					if (provided.has(id)) {
						continue;
					}
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

function resolveProvidedCapabilities(
	loader: ModuleLoader,
	arena: MiddleEndArena,
	functionInfo: ArenaFunction,
	call: ArenaCall,
): ReadonlySet<string> {
	if (call.providedType == null) {
		return new Set();
	}
	const moduleInfo = arena.modules[functionInfo.moduleIndex];
	if (moduleInfo == null) {
		return new Set();
	}
	const provided = resolveCapabilityIds(loader, moduleInfo, call.providedType, []);
	if (provided.reasons.length > 0) {
		return new Set();
	}
	return provided.ids;
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
	const location = unsupportedLocation(reason);
	return {
		column: location.column ?? functionInfo.column,
		filePath: location.filePath ?? functionInfo.filePath,
		functionName: functionInfo.name,
		line: location.line ?? functionInfo.line,
		...(notes == null ? {} : { notes }),
		reason: reason.message,
	};
}

function unsupportedLocation(reason: UnsupportedReason): {
	readonly column?: number;
	readonly filePath?: string;
	readonly line?: number;
} {
	return reason.kind === "capability-resolution" ? reason : {};
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
			return reason.notes;
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
