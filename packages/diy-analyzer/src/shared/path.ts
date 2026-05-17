export function normalizePath(filePath: string): string {
	return filePath.replaceAll("\\", "/");
}
