import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

// Not allowed: constructors cannot take capabilities.
export class Service {
	readonly value: string;

	constructor(capabilities: Capabilities<ReaderCapability>) {
		this.value = capabilities.reader.read();
	}
}

// Not allowed, even as a later, renamed parameter.
export class Misplaced {
	readonly id: string;

	constructor(id: string, deps: Capabilities<WriterCapability>) {
		this.id = id;
		deps.writer.write(id);
	}
}

// Allowed: constructors without capabilities.
export class Plain {
	readonly id: string;

	constructor(id: string) {
		this.id = id;
	}
}

// Allowed: a function that takes capabilities instead of a constructor.
export async function createService(capabilities: Capabilities<ReaderCapability>): Promise<string> {
	return capabilities.reader.read();
}
