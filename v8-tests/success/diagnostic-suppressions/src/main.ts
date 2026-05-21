import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"fs", unknown>;

declare function use(value: unknown): void;

export function start(capabilities: Capabilities<FsCapability>): void {
	const metadata = { capabilities: { tools: {} } };
	use(metadata);
	void capabilities;
	capabilities.fs;
}

export function suppressedParameter(
	// diy-ignore-next-line -- framework boundary validates capabilities before dispatch.
	capabilities: unknown,
): void {
	use(capabilities);
}

export const suppressedArrow = (
	// diy-ignore-next-line -- callback receives framework-validated capabilities.
	capabilities: unknown,
): void => {
	use(capabilities);
};

export const suppressedObject = {
	run(
		// diy-ignore-next-line -- method receives framework-validated capabilities.
		capabilities: unknown,
	): void {
		use(capabilities);
	},
};

export class SuppressedWorker {
	static run(
		// diy-ignore-next-line -- class method receives framework-validated capabilities.
		capabilities: unknown,
	): void {
		use(capabilities);
	}
}

export function suppressedAfterRegularComment(
	// ordinary leading comment should not become the diagnostic location.
	// diy-ignore-next-line -- suppression still targets the following parameter line.
	capabilities: unknown,
): void {
	use(capabilities);
}

export function suppressedBeforeRegularComment(
	// diy-ignore-next-line -- suppression can sit above another leading comment.
	// ordinary leading comment should not prevent targeting the parameter line.
	capabilities: unknown,
): void {
	use(capabilities);
}

export function suppressedBeforeDirectiveStack(
	// diy-ignore-next-line -- suppression can sit above the rest of the directive stack.
	/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
	// @ts-expect-error intentionally invalid for analyzer suppression coverage.
	capabilities: Capabilities,
): void {
	use(capabilities);
}

export function suppressedSecondParameter(
	value: string,
	// diy-ignore-next-line -- legacy callback shape keeps capabilities after the event value.
	capabilities: Capabilities<FsCapability>,
): void {
	use(value);
	use(capabilities);
}

export function suppressedRenamedParameter(
	// diy-ignore-next-line -- adapter preserves a third-party parameter name.
	bag: Capabilities<FsCapability>,
): void {
	bag.fs;
}
