import { describe, expect, it } from "vitest";

import {
	declaredParameterType,
	isDiyCapabilitiesAnnotation,
	isOpaqueCapabilitiesType,
} from "../../packages/diy-analyzer/src/analysis/capability-types.ts";

type ParameterNameArg = Parameters<typeof declaredParameterType>[1];
type ParameterSymbolArg = Parameters<typeof declaredParameterType>[2];
type SourceFileArg = Parameters<typeof isDiyCapabilitiesAnnotation>[0];
type TypeNodeArg = Parameters<typeof isDiyCapabilitiesAnnotation>[1];

const typeReferenceKind = 184;
const parenthesizedTypeKind = 197;

describe("DIY Capabilities annotations", () => {
	it("accepts direct imports without checker declaration identity", () => {
		const source = sourceFile({
			imports: [["Capabilities", { importedName: "Capabilities", source: "@beff/diy" }]],
		});
		const annotation = typeReference("Capabilities", [typeReference("DataCapability")]);

		expect(isDiyCapabilitiesAnnotation(source, annotation)).toBe(true);
	});

	it("accepts local aliases by following parsed type alias declarations", () => {
		const source = sourceFile({
			imports: [["Capabilities", { importedName: "Capabilities", source: "@beff/diy" }]],
			typeAliases: [
				["AppCapabilities", typeReference("Capabilities", [typeReference("DataCapability")])],
			],
		});

		expect(isDiyCapabilitiesAnnotation(source, typeReference("AppCapabilities"))).toBe(true);
	});

	it("accepts parenthesized local aliases", () => {
		const source = sourceFile({
			imports: [["Capabilities", { importedName: "Capabilities", source: "@beff/diy" }]],
			typeAliases: [
				[
					"AppCapabilities",
					parenthesized(typeReference("Capabilities", [typeReference("DataCapability")])),
				],
			],
		});

		expect(isDiyCapabilitiesAnnotation(source, typeReference("AppCapabilities"))).toBe(true);
	});

	it("rejects cyclic aliases", () => {
		const source = sourceFile({
			imports: [["Capabilities", { importedName: "Capabilities", source: "@beff/diy" }]],
			typeAliases: [
				["FirstCapabilities", typeReference("SecondCapabilities")],
				["SecondCapabilities", typeReference("FirstCapabilities")],
			],
		});

		expect(isDiyCapabilitiesAnnotation(source, typeReference("FirstCapabilities"))).toBe(false);
	});

	it("rejects Capabilities imports from other packages without asking the checker", () => {
		const source = sourceFile({
			imports: [
				["Capabilities", { importedName: "Capabilities", source: "@example/capabilities" }],
			],
		});
		const annotation = typeReference("Capabilities", [typeReference("DataCapability")]);

		expect(isDiyCapabilitiesAnnotation(source, annotation)).toBe(false);
	});

	it("rejects aliases that do not resolve syntactically to DIY Capabilities", () => {
		const source = sourceFile({
			imports: [["Capabilities", { importedName: "Capabilities", source: "@beff/diy" }]],
			typeAliases: [["Input", typeReference("InputCodec")]],
		});

		expect(isDiyCapabilitiesAnnotation(source, typeReference("Input"))).toBe(false);
	});

	it("rejects Capabilities without a type argument", () => {
		const source = sourceFile({
			imports: [["Capabilities", { importedName: "Capabilities", source: "@beff/diy" }]],
		});

		expect(isDiyCapabilitiesAnnotation(source, typeReference("Capabilities"))).toBe(false);
	});

	it("does not treat unrelated annotations as opaque Capabilities", () => {
		const checker = {
			getTypeFromTypeNode: () => undefined,
		} as unknown as Parameters<typeof isOpaqueCapabilitiesType>[0];
		const source = sourceFile({
			imports: [["Capabilities", { importedName: "Capabilities", source: "@beff/diy" }]],
		});

		expect(isOpaqueCapabilitiesType(checker, source, typeReference("Input"))).toBe(false);
	});

	it("reads declared types from parameter bindings instead of annotation locations", () => {
		const declaredType = typeWithProperties(["access", "catalog"]);
		const annotationLocationType = typeWithProperties(["then", "catch", "finally"]);
		const parameterName = {} as ParameterNameArg;
		const parameterSymbol = {} as ParameterSymbolArg;
		const checker = {
			getTypeAtLocation: () => annotationLocationType,
			getTypeOfSymbolAtLocation: (symbol: unknown, location: unknown) =>
				symbol === parameterSymbol && location === parameterName ? declaredType : undefined,
		} as unknown as Parameters<typeof declaredParameterType>[0];

		expect(declaredParameterType(checker, parameterName, parameterSymbol)).toBe(declaredType);
	});

	it("uses the parameter name type when the symbol location type is unavailable", () => {
		const declaredType = typeWithProperties(["access"]);
		const checker = {
			getTypeAtLocation: () => declaredType,
			getTypeOfSymbolAtLocation: () => undefined,
		} as unknown as Parameters<typeof declaredParameterType>[0];

		expect(declaredParameterType(checker, {} as ParameterNameArg, {} as ParameterSymbolArg)).toBe(
			declaredType,
		);
	});
});

function typeReference(name: string, typeArguments: readonly TypeNodeArg[] = []): TypeNodeArg {
	return {
		kind: typeReferenceKind,
		typeArguments,
		typeName: { text: name },
	} as unknown as TypeNodeArg;
}

function parenthesized(type: TypeNodeArg): TypeNodeArg {
	return {
		kind: parenthesizedTypeKind,
		type,
	} as unknown as TypeNodeArg;
}

function sourceFile({
	imports = [],
	typeAliases = [],
}: {
	readonly imports?: readonly [
		string,
		{ readonly importedName: string; readonly source: string },
	][];
	readonly typeAliases?: readonly [string, TypeNodeArg][];
}): SourceFileArg {
	return {
		imports: new Map(imports.map(([name, imported]) => [name, { kind: "named", ...imported }])),
		typeAliases: new Map(typeAliases),
	} as unknown as SourceFileArg;
}

function typeWithProperties(names: readonly string[]): unknown {
	return { properties: names };
}
