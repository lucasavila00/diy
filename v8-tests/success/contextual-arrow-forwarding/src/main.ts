import type { Capabilities, Capability } from "@beff/diy";

import type { ImportedReader } from "./types.ts";

type ReadCapability = Capability<"read", { read(): string }>;
type WriteCapability = Capability<"write", { write(value: string): void }>;
type AuditCapability = Capability<"audit", { record(value: string): void }>;

namespace Types {
	export type QualifiedReader = (capabilities: Capabilities<ReadCapability>) => string;
}

type Reader = (capabilities: Capabilities<ReadCapability>) => string;
type ReaderAlias = Reader;
type ParenthesizedReader = (capabilities: Capabilities<ReadCapability>) => string;
type Auditor = (capabilities: Capabilities<AuditCapability>, value: string) => void;
type Runner = (
	capabilities: Capabilities<AuditCapability | ReadCapability | WriteCapability>,
) => void;
type Recursive = Recursive;

const readValue: Reader = (capabilities) => capabilities.read.read();

const readViaAlias: ReaderAlias = (capabilities) => {
	return capabilities.read.read();
};

const readParenthesized: ParenthesizedReader = (capabilities) => capabilities.read.read();

const writeValue: (capabilities: Capabilities<WriteCapability>, value: string) => void = (
	capabilities,
	value,
) => {
	capabilities.write.write(value);
};

const auditValue: Auditor = function (capabilities, value) {
	capabilities.audit.record(value);
};

const ignoredUnknown: unknown = (_capabilities: unknown) => {};
const ignoredQualified: Types.QualifiedReader = (_capabilities) => String(_capabilities);
const ignoredImported: ImportedReader = (_capabilities) => String(_capabilities);
const ignoredRecursive: Recursive = (_capabilities: unknown) => String(_capabilities);

export const run: Runner = (capabilities) => {
	const value = readValue(capabilities);
	readParenthesized(capabilities);
	readViaAlias(capabilities);
	writeValue(capabilities, value);
	auditValue(capabilities, value);
};
