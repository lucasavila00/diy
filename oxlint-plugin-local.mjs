import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";

const normalizePath = (filename) => filename.split(sep).join("/");

const isNullishComparisonOperand = (node) =>
	(node.type === "Literal" && node.value == null) ||
	(node.type === "Identifier" && node.name === "undefined");

const noStrictNullishComparison = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow strict comparisons to null or undefined. Use loose nullish checks instead.",
		},
		messages: {
			noStrictNullishEquality: "Use `== null` when checking for null or undefined.",
			noStrictNullishInequality: "Use `!= null` when checking for null or undefined.",
		},
		schema: [],
	},
	create(context) {
		return {
			BinaryExpression(node) {
				if (node.operator !== "===" && node.operator !== "!==") {
					return;
				}

				if (!isNullishComparisonOperand(node.left) && !isNullishComparisonOperand(node.right)) {
					return;
				}

				context.report({
					node,
					messageId:
						node.operator === "===" ? "noStrictNullishEquality" : "noStrictNullishInequality",
				});
			},
		};
	},
};

const hasTypeParameters = (node) => node.typeParameters != null || node.typeArguments != null;

const noUselessTypeAlias = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow one-to-one TypeScript type aliases.",
		},
		messages: {
			noUselessTypeAlias: "Avoid one-to-one type aliases. Use the original type name directly.",
		},
		schema: [],
	},
	create(context) {
		return {
			TSTypeAliasDeclaration(node) {
				const typeAnnotation = node.typeAnnotation;
				if (
					node.typeParameters != null ||
					typeAnnotation.type !== "TSTypeReference" ||
					hasTypeParameters(typeAnnotation) ||
					typeAnnotation.typeName.type !== "Identifier"
				) {
					return;
				}

				context.report({
					node,
					messageId: "noUselessTypeAlias",
				});
			},
		};
	},
};

const getStaticPropertyName = (key) => {
	if (key.type === "Identifier") {
		return key.name;
	}
	if (key.type === "Literal" && typeof key.value === "string") {
		return key.value;
	}
	return null;
};

const getIdentityProjection = (property) => {
	if (
		property.type !== "Property" ||
		property.kind !== "init" ||
		property.method ||
		property.computed ||
		property.shorthand
	) {
		return null;
	}

	const keyName = getStaticPropertyName(property.key);
	if (keyName == null) {
		return null;
	}

	const value = property.value;
	if (
		value.type !== "MemberExpression" ||
		value.computed ||
		value.object.type !== "Identifier" ||
		value.property.type !== "Identifier" ||
		value.property.name !== keyName
	) {
		return null;
	}

	return {
		keyName,
		sourceName: value.object.name,
	};
};

const noUselessObject = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow object literals that only copy same-named fields from one object.",
		},
		messages: {
			noUselessObject: "Avoid object projections that only copy same-named fields.",
		},
		schema: [],
	},
	create(context) {
		return {
			ObjectExpression(node) {
				if (node.properties.length === 0) {
					return;
				}

				let hasProjection = false;
				let sourceName = null;
				for (const property of node.properties) {
					if (property.type === "SpreadElement") {
						continue;
					}

					const projection = getIdentityProjection(property);
					if (projection == null) {
						return;
					}

					hasProjection = true;
					sourceName ??= projection.sourceName;
					if (projection.sourceName !== sourceName) {
						return;
					}
				}

				if (!hasProjection) {
					return;
				}

				context.report({
					node,
					messageId: "noUselessObject",
				});
			},
		};
	},
};

const getSimpleParamNames = (params) => {
	const names = [];
	for (const param of params) {
		if (param.type !== "Identifier") {
			return null;
		}
		names.push(param.name);
	}
	return names;
};

const getOnlyReturnedExpression = (node) => {
	if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") {
		return node.body;
	}

	if (node.body?.type !== "BlockStatement" || node.body.body.length !== 1) {
		return null;
	}

	const [statement] = node.body.body;
	if (statement?.type !== "ReturnStatement" || statement.argument == null) {
		return null;
	}

	return statement.argument;
};

const unwrapAwaitExpression = (expression) => {
	if (expression == null) {
		return null;
	}
	return expression.type === "AwaitExpression" ? expression.argument : expression;
};

const getFunctionAliasName = (node) => {
	if (node.type === "FunctionDeclaration") {
		return node.id?.name ?? null;
	}
	if (node.parent?.type === "VariableDeclarator" && node.parent.id.type === "Identifier") {
		return node.parent.id.name;
	}
	return null;
};

const noUselessFunctionForwarder = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow functions that only forward their parameters to another function.",
		},
		messages: {
			noUselessFunctionForwarder:
				"Avoid useless function forwarders. Use the called function directly instead.",
		},
		schema: [],
	},
	create(context) {
		const checkFunction = (node) => {
			const aliasName = getFunctionAliasName(node);
			if (aliasName == null) {
				return;
			}

			const paramNames = getSimpleParamNames(node.params);
			if (paramNames == null) {
				return;
			}

			const expression = unwrapAwaitExpression(getOnlyReturnedExpression(node));
			if (
				expression?.type !== "CallExpression" ||
				expression.callee.type !== "Identifier" ||
				expression.callee.name === aliasName ||
				expression.arguments.length !== paramNames.length
			) {
				return;
			}

			for (const [index, argument] of expression.arguments.entries()) {
				if (argument.type !== "Identifier" || argument.name !== paramNames[index]) {
					return;
				}
			}

			context.report({
				node,
				messageId: "noUselessFunctionForwarder",
			});
		};

		return {
			ArrowFunctionExpression: checkFunction,
			FunctionDeclaration: checkFunction,
			FunctionExpression: checkFunction,
		};
	},
};

const noViMock = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow `vi.mock` and favor direct dependency injection instead.",
		},
		messages: {
			noViMock: "Avoid vi.mock. Favor direct dependency injection instead.",
		},
		schema: [],
	},
	create(context) {
		return {
			CallExpression(node) {
				if (
					node.callee.type !== "MemberExpression" ||
					node.callee.object.type !== "Identifier" ||
					node.callee.object.name !== "vi" ||
					node.callee.property.type !== "Identifier" ||
					node.callee.property.name !== "mock"
				) {
					return;
				}

				context.report({
					node,
					messageId: "noViMock",
				});
			},
		};
	},
};

const noViSpy = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow `vi.spy*` and favor direct dependency injection instead.",
		},
		messages: {
			noViSpy: "Avoid vi.spy*. Favor direct dependency injection instead.",
		},
		schema: [],
	},
	create(context) {
		return {
			CallExpression(node) {
				if (
					node.callee.type !== "MemberExpression" ||
					node.callee.object.type !== "Identifier" ||
					node.callee.object.name !== "vi" ||
					node.callee.property.type !== "Identifier" ||
					!node.callee.property.name.startsWith("spy")
				) {
					return;
				}

				context.report({
					node,
					messageId: "noViSpy",
				});
			},
		};
	},
};

const sourceExtensions = new Set([".ts", ".tsx"]);
const jsExtensions = new Set([".js", ".jsx"]);

const resolveSourceImportTarget = (basePath) => {
	for (const candidate of [
		`${basePath}.ts`,
		`${basePath}.tsx`,
		resolve(basePath, "index.ts"),
		resolve(basePath, "index.tsx"),
	]) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
};

const workspaceImportPrefix = "@beff/";
const packageSegment = `${sep}packages${sep}`;
const packageManifestCache = new Map();

const getWorkspacePackageInfo = (filename) => {
	const resolvedFilename = resolve(filename);
	const packageIndex = resolvedFilename.lastIndexOf(packageSegment);
	if (packageIndex === -1) {
		return null;
	}

	const afterPackages = resolvedFilename.slice(packageIndex + packageSegment.length);
	const [packageName] = afterPackages.split(sep);
	if (packageName == null || packageName.length === 0) {
		return null;
	}

	const packageRoot = resolvedFilename.slice(
		0,
		packageIndex + packageSegment.length + packageName.length,
	);
	return {
		packageName,
		packageRoot,
	};
};

const parseWorkspaceImport = (source) => {
	if (!source.startsWith(workspaceImportPrefix)) {
		return null;
	}

	const importPath = source.slice(workspaceImportPrefix.length);
	const [packageName, ...rest] = importPath.split("/");
	if (packageName == null || packageName.length === 0) {
		return null;
	}

	return {
		packageName,
		subpath: rest.join("/"),
	};
};

const sourceImportExtensions = {
	meta: {
		type: "problem",
		docs: {
			description: "Require explicit .ts/.tsx extensions for package source imports.",
		},
		messages: {
			sourceImportExtension: "Use an explicit source extension for '{{source}}'{{suggestion}}.",
		},
		schema: [],
	},
	create(context) {
		const filename = String(context.filename ?? "");
		if (!/\/packages\/.*\.(?:ts|tsx)$/.test(normalizePath(filename))) {
			return {};
		}

		const fromPackage = getWorkspacePackageInfo(filename);
		const getExpectedSource = (sourceValue) => {
			const extension = extname(sourceValue);
			if (sourceExtensions.has(extension)) {
				return null;
			}

			const resolveBase = () => {
				if (sourceValue.startsWith(".")) {
					return resolve(dirname(filename), sourceValue);
				}

				const workspaceImport = parseWorkspaceImport(sourceValue);
				if (
					fromPackage == null ||
					workspaceImport == null ||
					!workspaceImport.subpath.startsWith("src/")
				) {
					return null;
				}

				const repoRoot = resolve(fromPackage.packageRoot, "..", "..");
				return resolve(repoRoot, "packages", workspaceImport.packageName, workspaceImport.subpath);
			};

			const basePath = resolveBase();
			if (basePath == null) {
				return null;
			}

			if (extension === "") {
				const target = resolveSourceImportTarget(basePath);
				if (target == null) {
					return null;
				}
				if (sourceValue.startsWith(".")) {
					return normalizePath(relative(dirname(filename), target)).replace(/^(?!\.)/, "./");
				}

				const workspaceImport = parseWorkspaceImport(sourceValue);
				return `${workspaceImportPrefix}${workspaceImport.packageName}/${normalizePath(
					relative(
						resolve(fromPackage.packageRoot, "..", "..", "packages", workspaceImport.packageName),
						target,
					),
				)}`;
			}

			if (!jsExtensions.has(extension)) {
				return null;
			}

			const withoutExtension = basePath.slice(0, -extension.length);
			const target = resolveSourceImportTarget(withoutExtension);
			if (target == null) {
				return null;
			}
			return sourceValue.slice(0, -extension.length) + extname(target);
		};

		const checkSource = (sourceNode) => {
			const sourceValue = sourceNode?.value;
			if (typeof sourceValue !== "string") {
				return;
			}

			const expected = getExpectedSource(sourceValue);
			if (expected == null) {
				return;
			}

			context.report({
				node: sourceNode,
				messageId: "sourceImportExtension",
				data: {
					source: sourceValue,
					suggestion: expected === sourceValue ? "" : `, e.g. '${expected}'`,
				},
			});
		};

		return {
			CallExpression(node) {
				if (node.callee.type === "Import" && node.arguments.length === 1) {
					checkSource(node.arguments[0]);
				}
			},
			ExportAllDeclaration(node) {
				checkSource(node.source);
			},
			ExportNamedDeclaration(node) {
				checkSource(node.source);
			},
			ImportDeclaration(node) {
				checkSource(node.source);
			},
			ImportExpression(node) {
				checkSource(node.source);
			},
		};
	},
};

const readPackageManifest = (packageRoot) => {
	if (packageManifestCache.has(packageRoot)) {
		return packageManifestCache.get(packageRoot);
	}

	const manifestPath = resolve(packageRoot, "package.json");
	if (!existsSync(manifestPath)) {
		packageManifestCache.set(packageRoot, null);
		return null;
	}

	try {
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
		packageManifestCache.set(packageRoot, manifest);
		return manifest;
	} catch {
		packageManifestCache.set(packageRoot, null);
		return null;
	}
};

const crossPackageImports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow relative imports across workspace package boundaries and require declared workspace dependencies.",
		},
		messages: {
			crossPackageRelativeImport:
				"Import '{{target}}' through '{{workspaceImport}}' instead of the relative path '{{source}}'.",
			missingWorkspaceDependency:
				"Declare '{{dependencyName}}' in this package.json before importing '{{source}}'.",
		},
		schema: [],
	},
	create(context) {
		const filename = String(context.filename ?? "");
		const fromPackage = getWorkspacePackageInfo(filename);
		if (fromPackage == null) {
			return {};
		}

		const manifest = readPackageManifest(fromPackage.packageRoot);

		const checkNode = (node) => {
			const sourceValue = node.source?.value;
			if (typeof sourceValue !== "string") {
				return;
			}

			if (sourceValue.startsWith(".")) {
				const resolvedImportPath = resolve(dirname(filename), sourceValue);
				const targetPackage = getWorkspacePackageInfo(resolvedImportPath);
				if (targetPackage == null || targetPackage.packageName === fromPackage.packageName) {
					return;
				}

				const suggestedSubpath = normalizePath(
					relative(targetPackage.packageRoot, resolvedImportPath),
				);
				const workspaceImport =
					suggestedSubpath.length === 0
						? `${workspaceImportPrefix}${targetPackage.packageName}`
						: `${workspaceImportPrefix}${targetPackage.packageName}/${suggestedSubpath}`;

				context.report({
					node: node.source,
					messageId: "crossPackageRelativeImport",
					data: {
						source: sourceValue,
						target: targetPackage.packageName,
						workspaceImport,
					},
				});
				return;
			}

			const workspaceImport = parseWorkspaceImport(sourceValue);
			if (workspaceImport == null || workspaceImport.packageName === fromPackage.packageName) {
				return;
			}

			const dependencyName = `${workspaceImportPrefix}${workspaceImport.packageName}`;
			const dependencies = manifest?.dependencies ?? {};
			const devDependencies = manifest?.devDependencies ?? {};
			if (dependencyName in dependencies || dependencyName in devDependencies) {
				return;
			}

			context.report({
				node: node.source,
				messageId: "missingWorkspaceDependency",
				data: {
					dependencyName,
					source: sourceValue,
				},
			});
		};

		return {
			ExportAllDeclaration: checkNode,
			ExportNamedDeclaration: checkNode,
			ImportDeclaration: checkNode,
		};
	},
};

const localPlugin = {
	meta: {
		name: "local",
	},
	rules: {
		"cross-package-imports": crossPackageImports,
		"no-strict-nullish-comparison": noStrictNullishComparison,
		"no-useless-function-forwarder": noUselessFunctionForwarder,
		"no-useless-object": noUselessObject,
		"no-useless-type-alias": noUselessTypeAlias,
		"no-vi-mock": noViMock,
		"no-vi-spy": noViSpy,
		"source-import-extensions": sourceImportExtensions,
	},
};

export default localPlugin;
