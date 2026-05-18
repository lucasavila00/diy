import type { Capabilities, Capability } from "@beff/diy";

type MongoCapability = Capability<"mongo", unknown>;
type DateCapability = Capability<"date", unknown>;
type LoggerCapability = Capability<"logger", unknown>;
type RandomCapability = Capability<"random", unknown>;

const migration = {
	up: async (capabilities: Capabilities<MongoCapability | DateCapability>): Promise<void> => {
		capabilities.mongo;
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
