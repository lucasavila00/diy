import type { Capabilities, Capability } from "@beff/diy";

type FsCapability = Capability<"fs", unknown>;

declare function use(value: unknown): void;

export const template = `
// diy-ignore-next-line -- text inside a template literal
`;

export const templateWithSubstitution = `${template}
// diy-ignore-next-line -- text inside a template middle ${template}
// diy-ignore-next-line -- text inside a template tail
`;

export const string =
	"\
// diy-ignore-next-line -- text inside a continued string literal";

/*
// diy-ignore-next-line -- text inside a block comment
*/

/**
 * Text inside a JSDoc comment.
// diy-ignore-next-line -- text inside a JSDoc comment
 */
export function suppressedParameter(
	// diy-ignore-next-line -- framework boundary validates capabilities before dispatch.
	capabilities: unknown,
): void {
	use(capabilities);
}

export function start(capabilities: Capabilities<FsCapability>): void {
	// diy-ignore-next-line -- stale framework suppression
	capabilities.fs;
}
