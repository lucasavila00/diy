import type { Capabilities, DataCapability, OperationDefinition } from "@example/capabilities";

export const operation: OperationDefinition<DataCapability> = {
	run: async (
		capabilities: Capabilities<DataCapability>,
		values: readonly unknown[],
	): Promise<readonly unknown[]> => {
		await capabilities.data.db();
		return values;
	},
};
