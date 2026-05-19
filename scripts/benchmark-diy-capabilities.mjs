import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const cacheDir = join(root, ".cache", "diy-capabilities-benchmark");
const sizes = [50, 100, 200, 400, 800];

const oldQuadraticTypes = withApi(`declare const serviceType: unique symbol;

type Capability<Id extends string, Service> = {
\treadonly id: Id;
\treadonly [serviceType]?: Service;
};

type CapabilityId<T> = T extends Capability<infer Id, unknown> ? Id : never;

type ServiceForId<Allowed, Id extends string> =
\tAllowed extends Capability<Id, infer Service> ? Service : never;

type ServiceMap<Allowed extends Capability<string, unknown>> = {
\treadonly [Id in CapabilityId<Allowed>]: ServiceForId<Allowed, Id>;
};

type Capabilities<in Allowed extends Capability<string, unknown>> = ServiceMap<Allowed>;
type ServiceOverrides<Allowed extends Capability<string, unknown>> = Partial<ServiceMap<Allowed>>;
`);

const remappedConditionalTypes = withApi(`declare const serviceType: unique symbol;

type Capability<Id extends string, Service> = {
\treadonly id: Id;
\treadonly [serviceType]?: Service;
};

type CapabilityId<T> = T extends Capability<infer Id, unknown> ? Id : never;

type ServiceMap<Allowed extends Capability<string, unknown>> = {
\treadonly [Single in Allowed as CapabilityId<Single>]: Single extends Capability<
\t\tstring,
\t\tinfer Service
\t>
\t\t? Service
\t\t: never;
};

type Capabilities<in Allowed extends Capability<string, unknown>> = ServiceMap<Allowed>;
type ServiceOverrides<Allowed extends Capability<string, unknown>> = Partial<ServiceMap<Allowed>>;
`);

const privateTypeAliasTypes = withApi(`declare const capabilityId: unique symbol;
declare const serviceType: unique symbol;

type Capability<Id extends string, Service> = {
\treadonly [capabilityId]: Id;
\treadonly [serviceType]: Service;
};

type ServiceMap<Allowed extends Capability<string, unknown>> = {
\treadonly [Single in Allowed as Single[typeof capabilityId]]: Single[typeof serviceType];
};

type Capabilities<in Allowed extends Capability<string, unknown>> = ServiceMap<Allowed>;
type ServiceOverrides<Allowed extends Capability<string, unknown>> = Partial<ServiceMap<Allowed>>;
`);

const currentSourceTypes = `import {
\tCapabilities,
\ttype Capability,
} from "../../packages/diy/src/capabilities.ts";
`;

const variants = [
	["old-quadratic", oldQuadraticTypes],
	["remapped-conditional", remappedConditionalTypes],
	["private-type-alias", privateTypeAliasTypes],
	["current-source", currentSourceTypes],
];

function withApi(capabilityTypes) {
	return `${capabilityTypes}
declare const Capabilities: {
\tcreate<Allowed extends Capability<string, unknown> = never>(
\t\tserviceMap: ServiceMap<Allowed>,
\t): Capabilities<Allowed>;
\textend<
\t\tAllowed extends Capability<string, unknown>,
\t\tExtra extends Capability<string, unknown>,
\t>(capabilities: Capabilities<Allowed>, extra: Capabilities<Extra>): Capabilities<Allowed | Extra>;
\toverride<Allowed extends Capability<string, unknown>>(
\t\tcapabilities: Capabilities<Allowed>,
\t\treplacement: ServiceOverrides<Allowed>,
\t): Capabilities<Allowed>;
\tmerge<
\t\tFirst extends Capability<string, unknown>,
\t\tSecond extends Capability<string, unknown>,
\t>(first: Capabilities<First>, second: Capabilities<Second>): Capabilities<First | Second>;
};
`;
}

function benchmarkSource(capabilityTypes, size) {
	const split = size / 2;
	const capabilities = Array.from({ length: size }, (_, index) => {
		const id = `cap${index}`;
		return `type Cap${index} = Capability<"${id}", {
\treadonly value${index}: ${index};
\tmethod${index}(): "${id}";
}>;`;
	}).join("\n");

	const all = capabilityUnion(0, size);
	const firstHalf = capabilityUnion(0, split);
	const secondHalf = capabilityUnion(split, size);
	const reads = Array.from(
		{ length: size },
		(_, index) => `\tconst value${index}: ${index} = capabilities.cap${index}.value${index};`,
	).join("\n");
	const voids = Array.from({ length: size }, (_, index) => `value${index}`).join(", ");

	return `${capabilityTypes}
${capabilities}

type AllCapabilities = ${all};
type FirstHalf = ${firstHalf};
type SecondHalf = ${secondHalf};

const first = Capabilities.create<FirstHalf>({
${serviceObject(0, split)}
});
const second = Capabilities.create<SecondHalf>({
${serviceObject(split, size)}
});
const merged = Capabilities.merge(first, second);
const extended = Capabilities.extend(first, second);
const capabilities = Capabilities.override(merged, {
\tcap0: { value0: 0, method0: () => "cap0" as const },
});

function use(capabilities: Capabilities<AllCapabilities>): void {
${reads}
\tvoid [${voids}];
}

use(capabilities);
use(extended);
`;
}

function capabilityUnion(start, end) {
	return Array.from({ length: end - start }, (_, index) => `Cap${start + index}`).join(" | ");
}

function serviceObject(start, end) {
	return Array.from({ length: end - start }, (_, index) => {
		const capabilityIndex = start + index;
		return `\tcap${capabilityIndex}: { value${capabilityIndex}: ${capabilityIndex}, method${capabilityIndex}: () => "cap${capabilityIndex}" as const },`;
	}).join("\n");
}

function runTsc(filePath) {
	const result = spawnSync(
		"pnpm",
		[
			"exec",
			"tsc",
			"--noEmit",
			"--strict",
			"--target",
			"ES2022",
			"--module",
			"NodeNext",
			"--moduleResolution",
			"NodeNext",
			"--allowImportingTsExtensions",
			"--skipLibCheck",
			"--pretty",
			"false",
			"--extendedDiagnostics",
			filePath,
		],
		{
			cwd: root,
			encoding: "utf8",
		},
	);

	const output = `${result.stdout}${result.stderr}`;
	if (result.status !== 0) {
		throw new Error(`tsc failed for ${filePath}\n${output}`);
	}

	return parseDiagnostics(output);
}

function parseDiagnostics(output) {
	return {
		instantiations: parseIntegerDiagnostic(output, "Instantiations"),
		checkTime: parseTimeDiagnostic(output, "Check time"),
		totalTime: parseTimeDiagnostic(output, "Total time"),
	};
}

function parseIntegerDiagnostic(output, label) {
	const match = output.match(new RegExp(`${label}:\\s+([\\d,]+)`));
	if (match === null) {
		throw new Error(`Missing "${label}" in tsc diagnostics.`);
	}

	return Number(match[1].replaceAll(",", ""));
}

function parseTimeDiagnostic(output, label) {
	const match = output.match(new RegExp(`${label}:\\s+([\\d.]+)s`));
	if (match === null) {
		throw new Error(`Missing "${label}" in tsc diagnostics.`);
	}

	return Number(match[1]);
}

function formatInteger(value) {
	return new Intl.NumberFormat("en-US").format(value);
}

function formatTime(value) {
	return `${value.toFixed(2)}s`;
}

function percentageDrop(baseline, current) {
	return ((baseline - current) / baseline) * 100;
}

function writeBenchmarkFile(kind, size, capabilityTypes) {
	const filePath = join(cacheDir, `${kind}-${size}.ts`);
	writeFileSync(filePath, benchmarkSource(capabilityTypes, size));
	return filePath;
}

rmSync(cacheDir, { recursive: true, force: true });
mkdirSync(cacheDir, { recursive: true });

const rows = [];

for (const size of sizes) {
	const results = new Map();

	for (const [name, capabilityTypes] of variants) {
		results.set(name, runTsc(writeBenchmarkFile(name, size, capabilityTypes)));
	}

	const oldQuadratic = results.get("old-quadratic");
	const remappedConditional = results.get("remapped-conditional");
	const privateTypeAlias = results.get("private-type-alias");
	const currentSource = results.get("current-source");

	rows.push({
		size,
		oldQuadratic,
		remappedConditional,
		privateTypeAlias,
		currentSource,
		dropFromOld: percentageDrop(oldQuadratic.instantiations, currentSource.instantiations),
		dropFromRemapped: percentageDrop(
			remappedConditional.instantiations,
			currentSource.instantiations,
		),
		dropFromPrivate: percentageDrop(privateTypeAlias.instantiations, currentSource.instantiations),
	});
}

console.log("DIY capability API benchmark");
console.log("");
console.log(
	[
		"size".padStart(5),
		"old inst".padStart(12),
		"remap inst".padStart(12),
		"private inst".padStart(13),
		"current inst".padStart(13),
		"vs private".padStart(10),
		"current check".padStart(14),
	].join("  "),
);

for (const row of rows) {
	console.log(
		[
			String(row.size).padStart(5),
			formatInteger(row.oldQuadratic.instantiations).padStart(12),
			formatInteger(row.remappedConditional.instantiations).padStart(12),
			formatInteger(row.privateTypeAlias.instantiations).padStart(13),
			formatInteger(row.currentSource.instantiations).padStart(13),
			`${row.dropFromPrivate.toFixed(1)}%`.padStart(10),
			formatTime(row.currentSource.checkTime).padStart(14),
		].join("  "),
	);
}

const privateRegressions = rows.filter(
	(row) => row.currentSource.instantiations >= row.privateTypeAlias.instantiations,
);
const largest = rows.at(-1);

if (privateRegressions.length > 0) {
	const sizes = privateRegressions.map((row) => row.size).join(", ");
	throw new Error(`Current API did not improve over private type alias at: ${sizes}.`);
}

if (largest.dropFromRemapped < 50) {
	throw new Error(
		`Expected at least a 50% instantiation drop from remapped conditional at size ${
			largest.size
		}, got ${largest.dropFromRemapped.toFixed(1)}%.`,
	);
}
