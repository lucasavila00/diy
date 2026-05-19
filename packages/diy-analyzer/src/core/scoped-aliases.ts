import type { TypeAliasParameter } from "./types.ts";

type TypeAliasModule = {
	readonly aliases: Map<string, unknown>;
	readonly aliasTypeParameters: Map<string, readonly TypeAliasParameter[]>;
	readonly namespaceAliases: Map<string, Map<string, unknown>>;
	readonly namespaceAliasTypeParameters: Map<string, Map<string, readonly TypeAliasParameter[]>>;
};

type ResolvedTypeAlias = {
	readonly namespaceName: string | null;
	readonly type: unknown;
	readonly typeParameters: readonly TypeAliasParameter[];
};

export function resolveLocalTypeAlias(
	moduleInfo: TypeAliasModule,
	typeName: string,
	namespaceName: string | null,
): ResolvedTypeAlias | null {
	for (const scope of namespaceScopes(namespaceName)) {
		const type = moduleInfo.namespaceAliases.get(scope)?.get(typeName);
		if (type != null) {
			return {
				namespaceName: scope,
				type,
				/* c8 ignore next -- alias collection records type parameters with each alias. */
				typeParameters: moduleInfo.namespaceAliasTypeParameters.get(scope)?.get(typeName) ?? [],
			};
		}
	}
	const type = moduleInfo.aliases.get(typeName);
	if (type == null) {
		return null;
	}
	return {
		namespaceName: null,
		type,
		/* c8 ignore next -- alias collection records type parameters with each alias. */
		typeParameters: moduleInfo.aliasTypeParameters.get(typeName) ?? [],
	};
}

export function hasLocalTypeAlias(
	moduleInfo: TypeAliasModule,
	typeName: string,
	namespaceName: string | null,
): boolean {
	return resolveLocalTypeAlias(moduleInfo, typeName, namespaceName) != null;
}

function namespaceScopes(namespaceName: string | null): readonly string[] {
	if (namespaceName == null) {
		return [];
	}
	const parts = namespaceName.split(".");
	const scopes: string[] = [];
	for (let length = parts.length; length > 0; length -= 1) {
		scopes.push(parts.slice(0, length).join("."));
	}
	return scopes;
}
