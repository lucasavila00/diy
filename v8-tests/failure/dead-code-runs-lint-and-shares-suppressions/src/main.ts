import type { Capabilities, Capability } from "@beff/diy";

type BeffParser<T> = {
	parse(value: unknown): T;
};
type MethodService = {
	record(error: unknown): void;
};
type ReadCapability = Capability<"read", { read(): string }>;

declare function use(value: unknown): void;

const wrapLeaf = (
	inputCodec: BeffParser<any>,
	outputCodec: BeffParser<any>,
	implFn: (capabilities: Capabilities<Capability<string, unknown>>, arg: any) => Promise<any>,
	methodName: string,
) => {
	use(inputCodec);
	use(outputCodec);
	use(methodName);
	return async (
		// diy-ignore-next-line -- framework-level wrapper; capabilities are passed through unchanged.
		capabilities: Capabilities<Capability<string, unknown>>,
		arg: unknown,
		errs?: MethodService,
	): Promise<unknown> => {
		use(errs);
		return implFn(capabilities, arg);
	};
};

export function misplaced(path: string, capabilities: Capabilities<ReadCapability>): void {
	use(path);
	capabilities.read;
}

void wrapLeaf;
