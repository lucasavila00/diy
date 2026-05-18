import type { Capabilities, Capability } from "@beff/diy/capabilities";

type AlphaCapability = Capability<"alpha", { read(): string }>;
type BetaCapability = Capability<"beta", { write(value: string): void }>;
type AnyCapability = Capability<string, unknown>;

type Procedure<C extends AnyCapability, Input, Output> = (
	capabilities: Capabilities<C>,
	input: Input,
) => Promise<Output>;

export const readProcedure: Procedure<AlphaCapability, { readonly id: string }, string> = async (
	capabilities,
	input,
) => `${capabilities.alpha.read()}:${input.id}`;

export const wrapProcedure = <C extends AnyCapability, Extra extends AnyCapability>(
	guard: (capabilities: Capabilities<C>, input: string) => Promise<string>,
	callback: (
		capabilities: Capabilities<C | Extra>,
		input: string,
		context: string,
	) => Promise<void>,
): Procedure<C | Extra, string, void> => {
	const procedure: Procedure<C | Extra, string, void> = async (capabilities, input) => {
		const context = await guard(capabilities as unknown as Capabilities<C>, input);
		await callback(capabilities, input, context);
	};
	return procedure;
};

export const intentionallyUnused = async (
	_capabilities: Capabilities<BetaCapability>,
): Promise<void> => {};

export async function nestedCallbackMerge(
	capabilities: Capabilities<AlphaCapability>,
	outerCallback: (capabilities: Capabilities<AlphaCapability>) => Promise<void>,
): Promise<void> {
	async function inner(
		capabilities: Capabilities<AlphaCapability>,
		innerCallback: (capabilities: Capabilities<AlphaCapability>) => Promise<void>,
	): Promise<void> {
		await outerCallback(capabilities);
		await innerCallback(capabilities);
	}

	await inner(capabilities, outerCallback);
}
