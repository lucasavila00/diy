import { describe, expect, it } from "vitest";

import { resolvedDiyCapabilitiesType } from "../../packages/diy-analyzer/src/analysis/capability-types.ts";

type CheckerArg = Parameters<typeof resolvedDiyCapabilitiesType>[0];
type TypeNodeArg = Parameters<typeof resolvedDiyCapabilitiesType>[1];

describe("resolvedDiyCapabilitiesType", () => {
	it("uses the location type when it carries the published DIY declaration", () => {
		const unresolvedType = diyType([]);
		const resolvedType = diyType([
			"/tmp/project/node_modules/@beff/diy/dist/types/capabilities.d.ts",
		]);
		const checker = {
			getTypeAtLocation: () => resolvedType,
			getTypeFromTypeNode: () => unresolvedType,
		} as unknown as CheckerArg;

		expect(resolvedDiyCapabilitiesType(checker, typeReference("Capabilities"))).toBe(resolvedType);
	});

	it("ignores location types for annotations that are not named Capabilities", () => {
		const resolvedType = diyType([
			"/tmp/project/node_modules/@beff/diy/dist/types/capabilities.d.ts",
		]);
		const checker = {
			getTypeAtLocation: () => resolvedType,
			getTypeFromTypeNode: () => diyType([]),
		} as unknown as CheckerArg;

		expect(resolvedDiyCapabilitiesType(checker, typeReference("InputCodec"))).toBeUndefined();
	});
});

function typeReference(name: string): TypeNodeArg {
	return { typeName: { text: name } } as unknown as TypeNodeArg;
}

function diyType(declarationPaths: readonly string[]): unknown {
	return {
		getSymbol: () => ({
			declarations: declarationPaths.map((path) => ({ path })),
		}),
	};
}
