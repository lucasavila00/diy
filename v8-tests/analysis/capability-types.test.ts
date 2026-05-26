import { describe, expect, it } from "vitest";

import { nodeTokenStart } from "../../packages/diy-analyzer/src/analysis/ast-utils.ts";
import {
	declaredParameterType,
	isDiyCapabilitiesAnnotation,
	isOpaqueCapabilitiesType,
	resolveCallSignature,
} from "../../packages/diy-analyzer/src/analysis/capability-types.ts";

type ParameterNameArg = Parameters<typeof declaredParameterType>[1];
type ParameterSymbolArg = Parameters<typeof declaredParameterType>[2];
type ResolveCallSourceFileArg = Parameters<typeof resolveCallSignature>[1];
type ResolveCallNodeArg = Parameters<typeof resolveCallSignature>[2];
type SourceFileArg = Parameters<typeof isDiyCapabilitiesAnnotation>[0];
type TypeNodeArg = Parameters<typeof isDiyCapabilitiesAnnotation>[1];

const typeReferenceKind = 184;
const parenthesizedTypeKind = 197;
const identifierKind = 79;
const propertyAccessExpressionKind = 212;
const callExpressionKind = 214;

describe("DIY Capabilities annotations", () => {
	it("finds token starts after leading trivia", () => {
		const source = "\n\tcapabilities: Capabilities<AppCapability>";
		const node = {
			end: 14,
			pos: 0,
			text: "capabilities",
		} as ParameterNameArg;

		expect(nodeTokenStart(source, node)).toBe(2);
	});

	it("returns null when a node has no token start", () => {
		const node = {
			end: 2,
			pos: 0,
			text: "capabilities",
		} as ParameterNameArg;

		expect(nodeTokenStart("\n\t", node)).toBeNull();
	});

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

	it("resolves property call signatures from the property token position", () => {
		const callableType = {};
		const signature = {};
		const source = sourceFile({
			filePath: "/case.ts",
			sourceText: "NameService.resolveFilteredNames(capabilities)",
		}) as ResolveCallSourceFileArg;
		const checker = {
			getSignaturesOfType: (type: unknown) => (type === callableType ? [signature] : []),
			getTypeAtPosition: (filePath: string, position: number) =>
				filePath === "/case.ts" && position === 12 ? callableType : undefined,
		} as unknown as Parameters<typeof resolveCallSignature>[0];
		const call = {
			expression: {
				end: 32,
				expression: { end: 11, kind: identifierKind, pos: 0, text: "NameService" },
				kind: propertyAccessExpressionKind,
				name: { end: 32, kind: identifierKind, pos: 12, text: "resolveFilteredNames" },
				pos: 0,
			},
			kind: callExpressionKind,
			pos: 0,
		} as ResolveCallNodeArg;

		expect(resolveCallSignature(checker, source, call)).toBe(signature);
	});

	it("returns no property call signature when the property token has no type", () => {
		const source = sourceFile({
			filePath: "/case.ts",
			sourceText: "NameService.resolveFilteredNames(capabilities)",
		}) as ResolveCallSourceFileArg;
		const checker = {
			getSignaturesOfType: () => {
				throw new Error("unexpected signature lookup");
			},
			getTypeAtPosition: () => undefined,
		} as unknown as Parameters<typeof resolveCallSignature>[0];
		const call = {
			expression: {
				end: 32,
				expression: { end: 11, kind: identifierKind, pos: 0, text: "NameService" },
				kind: propertyAccessExpressionKind,
				name: { end: 32, kind: identifierKind, pos: 12, text: "resolveFilteredNames" },
				pos: 0,
			},
			kind: callExpressionKind,
			pos: 0,
		} as ResolveCallNodeArg;

		expect(resolveCallSignature(checker, source, call)).toBeUndefined();
	});

	it("returns no property call signature when the property has no token start", () => {
		const source = sourceFile({
			filePath: "/case.ts",
			sourceText: "NameService.",
		}) as ResolveCallSourceFileArg;
		const checker = {
			getTypeAtPosition: () => {
				throw new Error("unexpected position lookup");
			},
		} as unknown as Parameters<typeof resolveCallSignature>[0];
		const call = {
			expression: {
				end: 12,
				expression: { end: 11, kind: identifierKind, pos: 0, text: "NameService" },
				kind: propertyAccessExpressionKind,
				name: { end: 12, kind: identifierKind, pos: 12, text: "resolveFilteredNames" },
				pos: 0,
			},
			kind: callExpressionKind,
			pos: 0,
		} as ResolveCallNodeArg;

		expect(resolveCallSignature(checker, source, call)).toBeUndefined();
	});

	it("returns no identifier call signature when the identifier has no token start", () => {
		const source = sourceFile({
			filePath: "/case.ts",
			sourceText: "\t",
		}) as ResolveCallSourceFileArg;
		const checker = {
			getTypeAtPosition: () => {
				throw new Error("unexpected position lookup");
			},
		} as unknown as Parameters<typeof resolveCallSignature>[0];
		const call = {
			expression: { end: 1, kind: identifierKind, pos: 0, text: "run" },
			kind: callExpressionKind,
			pos: 0,
		} as ResolveCallNodeArg;

		expect(resolveCallSignature(checker, source, call)).toBeUndefined();
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
	filePath = "/source.ts",
	imports = [],
	sourceText = "",
	typeAliases = [],
}: {
	readonly filePath?: string;
	readonly imports?: readonly [
		string,
		{ readonly importedName: string; readonly source: string },
	][];
	readonly sourceText?: string;
	readonly typeAliases?: readonly [string, TypeNodeArg][];
}): SourceFileArg {
	return {
		filePath,
		imports: new Map(imports.map(([name, imported]) => [name, { kind: "named", ...imported }])),
		sourceFile: { text: sourceText },
		typeAliases: new Map(typeAliases),
	} as unknown as SourceFileArg;
}

function typeWithProperties(names: readonly string[]): unknown {
	return { properties: names };
}
