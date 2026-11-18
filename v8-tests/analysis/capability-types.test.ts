import { describe, expect, it } from "vitest";

import {
	declaredParameterType,
	isDiyCapabilitiesAnnotation,
	isOpaqueCapabilitiesType,
} from "../../packages/diy-analyzer/src/analysis/capability-types.ts";

type ParameterNameArg = Parameters<typeof declaredParameterType>[1];
type ParameterSymbolArg = Parameters<typeof declaredParameterType>[2];
type CheckerArg = Parameters<typeof isDiyCapabilitiesAnnotation>[0];
type TypeNodeArg = Parameters<typeof isDiyCapabilitiesAnnotation>[1];

const stringLiteralKind = 10;
const typeReferenceKind = 184;
const parenthesizedTypeKind = 197;
const literalTypeKind = 202;
const importTypeKind = 206;

describe("DIY Capabilities annotations", () => {
	it("accepts parenthesized DIY Capabilities import types", async () => {
		const annotation = importType("@beff/diy", "Capabilities", [typeReference("DataCapability")]);

		expect(
			await isDiyCapabilitiesAnnotation(checkerWithSymbol(undefined), parenthesized(annotation)),
		).toBe(true);
	});

	it("does not treat unrelated annotations as opaque Capabilities", async () => {
		const checker = checkerWithSymbol(undefined);

		expect(await isOpaqueCapabilitiesType(checker, typeReference("Input"))).toBe(false);
	});

	it("reads declared types from parameter bindings instead of annotation locations", async () => {
		const declaredType = typeWithProperties(["access", "catalog"]);
		const annotationLocationType = typeWithProperties(["then", "catch", "finally"]);
		const parameterName = {} as ParameterNameArg;
		const parameterSymbol = {} as ParameterSymbolArg;
		const checker = {
			getTypeAtLocation: async () => annotationLocationType,
			getTypeOfSymbolAtLocation: async (symbol: unknown, location: unknown) =>
				symbol === parameterSymbol && location === parameterName ? declaredType : undefined,
		} as unknown as Parameters<typeof declaredParameterType>[0];

		expect(await declaredParameterType(checker, parameterName, parameterSymbol)).toBe(declaredType);
	});

	it("uses the parameter name type when the symbol location type is unavailable", async () => {
		const declaredType = typeWithProperties(["access"]);
		const checker = {
			getTypeAtLocation: async () => declaredType,
			getTypeOfSymbolAtLocation: async () => undefined,
		} as unknown as Parameters<typeof declaredParameterType>[0];

		expect(
			await declaredParameterType(checker, {} as ParameterNameArg, {} as ParameterSymbolArg),
		).toBe(declaredType);
	});
});

function typeReference(name: string, typeArguments: readonly TypeNodeArg[] = []): TypeNodeArg {
	return {
		kind: typeReferenceKind,
		typeArguments,
		typeName: { text: name },
	} as unknown as TypeNodeArg;
}

function importType(
	source: string,
	qualifier: string,
	typeArguments: readonly TypeNodeArg[],
): TypeNodeArg {
	return {
		argument: { kind: literalTypeKind, literal: { kind: stringLiteralKind, text: source } },
		kind: importTypeKind,
		qualifier: { text: qualifier },
		typeArguments,
	} as unknown as TypeNodeArg;
}

function parenthesized(type: TypeNodeArg): TypeNodeArg {
	return {
		kind: parenthesizedTypeKind,
		type,
	} as unknown as TypeNodeArg;
}

function checkerWithSymbol(symbol: unknown): CheckerArg {
	return {
		getSymbolAtLocation: async () => symbol,
	} as unknown as CheckerArg;
}

function typeWithProperties(names: readonly string[]): unknown {
	return { properties: names };
}
