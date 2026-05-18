type AlphaService = { read(): string };

export const untypedStandalone = async (capabilities: {
	readonly alpha: AlphaService;
}): Promise<string> => capabilities.alpha.read();

export const untypedObject = {
	read: async (capabilities) => capabilities.alpha.read(),
} satisfies Record<string, (capabilities: { readonly alpha: AlphaService }) => Promise<string>>;
