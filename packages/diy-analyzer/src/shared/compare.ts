// Code-unit order, independent of the process locale, so output is deterministic.
export function compareStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
