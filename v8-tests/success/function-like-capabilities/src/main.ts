import type { Capabilities, Capability } from "@beff/diy";

type DataCapability = Capability<"data", unknown>;
type DateCapability = Capability<"date", unknown>;
type LoggerCapability = Capability<"logger", unknown>;
type RandomCapability = Capability<"random", unknown>;

const operation = {
	up: async (capabilities: Capabilities<DataCapability | DateCapability>): Promise<void> => {
		capabilities.data;
		capabilities.date;
	},
};

const methodContainer = {
	run(capabilities: Capabilities<LoggerCapability>): void {
		capabilities.logger;
	},
};

class Worker {
	static execute(capabilities: Capabilities<RandomCapability>): void {
		capabilities.random;
	}
}

const callbacks = [
	(capabilities: Capabilities<DateCapability>): void => {
		capabilities.date;
	},
];

export function run(capabilities: Capabilities<LoggerCapability | RandomCapability>): void {
	methodContainer.run(capabilities);
	Worker.execute(capabilities);
}
