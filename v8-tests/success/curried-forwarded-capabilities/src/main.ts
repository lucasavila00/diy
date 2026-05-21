import type { Capabilities, Capability } from "@beff/diy";

type FetchCapability = Capability<"fetch", { fetch(): Promise<string> }>;
type DateCapability = Capability<"date", { now(): Date }>;
type CryptoCapability = Capability<"crypto", { decode(value: string): string }>;

type FetchToken = (
	capabilities: Capabilities<FetchCapability>,
	refreshToken: string,
) => Promise<string>;

function decodeToken(capabilities: Capabilities<CryptoCapability>, encoded: string): string {
	return capabilities.crypto.decode(encoded);
}

const refreshToken =
	(fetchToken: FetchToken) =>
	async (
		capabilities: Capabilities<FetchCapability | DateCapability>,
		refreshToken: string,
	): Promise<string> => {
		const response = await fetchToken(capabilities, refreshToken);
		const timestamp = capabilities.date.now().toISOString();
		return `${timestamp}:${response}`;
	};

export const refreshFromEncoded =
	(fetchToken: FetchToken) =>
	async (
		capabilities: Capabilities<FetchCapability | DateCapability | CryptoCapability>,
		encoded: string,
	): Promise<string> => {
		const refreshTokenValue = decodeToken(capabilities, encoded);
		return refreshToken(fetchToken)(capabilities, refreshTokenValue);
	};
