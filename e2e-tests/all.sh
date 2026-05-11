#!/usr/bin/env bash
set -u
set -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILURE_DIR="$ROOT_DIR/failure"
found=0

for case_dir in "$FAILURE_DIR"/*; do
	if [ ! -d "$case_dir" ] || [ "$(basename "$case_dir")" = "node_modules" ]; then
		continue
	fi

	found=1
	case_name="$(basename "$case_dir")"
	stdout_file="$case_dir/stdout.txt"
	stderr_file="$case_dir/stderr.txt"

	echo "Running DIY failure e2e: $case_name"
	echo "  writing stdout to: $stdout_file"
	echo "  writing stderr to: $stderr_file"

	if (cd "$case_dir" && pnpm --silent --filter @beff/diy-cli run analyze src) >"$stdout_file" 2>"$stderr_file"; then
		echo "Expected DIY analyzer to fail for $case_name, but it passed." >&2
		exit 1
	else
		status=$?
		if [ "$status" -eq 1 ]; then
			echo "Passed DIY failure e2e: $case_name"
		else
			echo "Failed DIY failure e2e: $case_name (exit $status); see $stdout_file and $stderr_file" >&2
			exit "$status"
		fi
	fi
done

if [ "$found" -eq 0 ]; then
	echo "No DIY failure e2e cases found under $FAILURE_DIR" >&2
	exit 1
fi

exit 0
