import { describe, expect, it } from "vitest";

import {
	isDiyCapabilitiesAnnotation,
	isOpaqueCapabilitiesType,
	resolvedDiyCapabilitiesType,
} from "../../packages/diy-analyzer/src/analysis/capability-types.ts";

type CheckerArg = Parameters<typeof resolvedDiyCapabilitiesType>[0];
type SourceFileArg = Parameters<typeof resolvedDiyCapabilitiesType>[1];
type TypeNodeArg = Parameters<typeof resolvedDiyCapabilitiesType>[2];

const typeReferenceKind = 184;
const parenthesizedTypeKind = 197;

describe("DIY Capabilities annotations", () => {
	it("accepts direct imports without checker declaration identity", () => {
		const resolvedType = typeWithProperties(["data"]);
		const checker = {
			getPropertiesOfType: (type: unknown) => (type === resolvedType ? [{ name: "data" }] : []),
			getTypeAtLocation: () => resolvedType,
			getTypeFromTypeNode: () => typeWithProperties([]),
		} as unknown as CheckerArg;
		const source = sourceFile({
			imports: [["Capabilities", { importedName: "Capabilities", source: "@beff/diy" }]],
		});
		const annotation = typeReference("Capabilities", [typeReference("DataCapability")]);

		expect(isDiyCapabilitiesAnnotation(source, annotation)).toBe(true);
		expect(resolvedDiyCapabilitiesType(checker, source, annotation)).toBe(resolvedType);
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
		const checker = {
			getPropertiesOfType: () => [{ name: "data" }],
			getTypeAtLocation: () => typeWithProperties(["data"]),
			getTypeFromTypeNode: () => typeWithProperties(["data"]),
		} as unknown as CheckerArg;
		const source = sourceFile({
			imports: [
				["Capabilities", { importedName: "Capabilities", source: "@example/capabilities" }],
			],
		});
		const annotation = typeReference("Capabilities", [typeReference("DataCapability")]);

		expect(isDiyCapabilitiesAnnotation(source, annotation)).toBe(false);
		expect(resolvedDiyCapabilitiesType(checker, source, annotation)).toBeUndefined();
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
		} as unknown as CheckerArg;
		const source = sourceFile({
			imports: [["Capabilities", { importedName: "Capabilities", source: "@beff/diy" }]],
		});

		expect(isOpaqueCapabilitiesType(checker, source, typeReference("Input"))).toBe(false);
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
