import { performance } from "node:perf_hooks";

type TimingEntry = {
	readonly label: string;
	readonly ms: number;
};

type MetricEntry = {
	readonly label: string;
	readonly value: number;
};

const enabled = process.env["DIY_ANALYZER_TIMING"] === "1";
const entries: TimingEntry[] = [];
const metrics = new Map<string, number>();
let flushed = false;

export function timeDeadCodePhase<T>(label: string, run: () => T): T {
	if (!enabled) {
		return run();
	}
	const start = performance.now();
	try {
		return run();
	} finally {
		entries.push({ label, ms: performance.now() - start });
	}
}

export async function timeDeadCodePhaseAsync<T>(label: string, run: () => Promise<T>): Promise<T> {
	if (!enabled) {
		return run();
	}
	const start = performance.now();
	try {
		return await run();
	} finally {
		entries.push({ label, ms: performance.now() - start });
	}
}

export function recordDeadCodeMetric(label: string, value: number): void {
	if (!enabled) {
		return;
	}
	metrics.set(label, (metrics.get(label) ?? 0) + value);
}

export function flushDeadCodeTimings(): void {
	if (!enabled || flushed) {
		return;
	}
	flushed = true;
	const metricEntries: MetricEntry[] = Array.from(metrics, ([label, value]) => ({ label, value }));
	const lines = [
		...metricEntries.map((entry) => `  ${entry.label}: ${entry.value}`),
		...entries.map((entry) => `  ${entry.label}: ${entry.ms.toFixed(1)}ms`),
	];
	process.stderr.write(`DIY analyzer dead-code timings:\n${lines.join("\n")}\n`);
}
