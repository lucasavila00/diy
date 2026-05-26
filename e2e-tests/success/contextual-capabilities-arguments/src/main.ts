import type { Capabilities, Capability } from "@beff/diy";

type RequestInput = { readonly query: string };
type ResultOutput = readonly unknown[];

type PrimaryDepsCapability = Capability<"primaryDeps", { get(): unknown }>;
type SecondaryDepsCapability = Capability<"secondaryDeps", { get(): unknown }>;

declare function loadSuggestions(deps: unknown, input: RequestInput): Promise<ResultOutput>;

export const loadPrimarySuggestions = (
	capabilities: Capabilities<PrimaryDepsCapability>,
	input: RequestInput,
): Promise<ResultOutput> => loadSuggestions(capabilities.primaryDeps.get(), input);

export const loadSecondarySuggestions = (
	capabilities: Capabilities<SecondaryDepsCapability>,
	input: RequestInput,
): Promise<ResultOutput> => loadSuggestions(capabilities.secondaryDeps.get(), input);
