import type { Capabilities, Capability } from "@beff/diy";

type RequestInput = { readonly query: string };
type ResultOutput = readonly unknown[];

type PrimaryCapability = Capability<"primaryService", { get(): unknown }>;
type SecondaryCapability = Capability<"secondaryService", { get(): unknown }>;

declare function loadData(deps: unknown, input: RequestInput): Promise<ResultOutput>;

export const loadPrimary = (
	capabilities: Capabilities<PrimaryCapability>,
	input: RequestInput,
): Promise<ResultOutput> => loadData(capabilities.primaryService.get(), input);

export const loadSecondary = (
	capabilities: Capabilities<SecondaryCapability>,
	input: RequestInput,
): Promise<ResultOutput> => loadData(capabilities.secondaryService.get(), input);
