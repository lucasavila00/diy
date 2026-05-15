import { Capabilities, type Capability } from "@beff/diy";

import type DefaultThing from "./default.ts";
// @ts-expect-error intentionally unresolved for analyzer coverage
import type { MissingImport } from "./missing.ts";
import type { NotAlias } from "./not-alias.ts";
import "./side-effect.ts";

type ReadCapability = Capability<"read", unknown>;
type AnyCapability = Capability<string, unknown>;
// @ts-expect-error intentionally invalid for analyzer coverage
type MissingTypeNode = Capabilities;

declare namespace Namespaced {
	export type ReadCapability = Capability<"namespacedReader", unknown>;
}

declare function use(value: unknown): void;
declare const replacement: unknown;

export function parenthesized(capabilities: Capabilities<ReadCapability>): void {
	capabilities.read;
}

export function missingTypeArgument(capabilities: MissingTypeNode): void {
	use(capabilities);
}

export function directMissingTypeArgument(
	// @ts-expect-error intentionally invalid for analyzer coverage
	capabilities: Capabilities,
): void {
	use(capabilities);
}

export function rawType(
	// @ts-expect-error intentionally invalid for analyzer coverage
	capabilities: Capabilities<string>,
): void {
	use(capabilities);
}

export function qualified(capabilities: Capabilities<Namespaced.ReadCapability>): void {
	use(capabilities);
}

export function unresolvedLocal(
	// @ts-expect-error intentionally invalid for analyzer coverage
	capabilities: Capabilities<MissingLocal | string>,
): void {
	use(capabilities);
}

export function unresolvedImport(capabilities: Capabilities<MissingImport>): void {
	use(capabilities);
}

export function unresolvedImportedAlias(
	// @ts-expect-error intentionally invalid for analyzer coverage
	capabilities: Capabilities<NotAlias>,
): void {
	use(capabilities);
}

export function nonStringCapability(capabilities: Capabilities<AnyCapability>): void {
	use(capabilities);
}

export function unresolvedDefaultImport(
	// @ts-expect-error intentionally invalid for analyzer coverage
	capabilities: Capabilities<DefaultThing>,
): void {
	use(capabilities);
}

export function missingProvideType(capabilities: Capabilities<ReadCapability>): void {
	use(Capabilities.extend(capabilities, Capabilities.create({ read: replacement })));
}

export function untypedExtend(capabilities: Capabilities<ReadCapability>): void {
	use(Capabilities.extend(capabilities, { read: replacement }));
}
