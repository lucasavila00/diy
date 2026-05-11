#!/usr/bin/env bash
set -u
set -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$#" -gt 0 ]; then
	echo "Usage: bash e2e-tests/all.sh" >&2
	exit 1
fi

run_case() {
	local case_dir="$1"
	local expected_status="$3"
	local kind="$2"
	local case_name
	case_name="$(basename "$case_dir")"
	local stdout_file="$case_dir/stdout.txt"
	local stderr_file="$case_dir/stderr.txt"
	local status
	local -a command

	if [ ! -d "$case_dir" ] || [ "$case_name" = "node_modules" ]; then
		return
	fi

	echo "Running DIY $kind CLI e2e: $case_name"
	echo "  writing stdout to: $stdout_file"
	echo "  writing stderr to: $stderr_file"

	if [ -f "$case_dir/command.sh" ]; then
		command=(bash command.sh)
	else
		command=(npm --silent --prefix "$ROOT_DIR" run diy-cli -- -p diy.json)
	fi

	if (cd "$case_dir" && "${command[@]}") >"$stdout_file" 2>"$stderr_file"; then
		status=0
	else
		status=$?
	fi

	if [ "$status" -ne "$expected_status" ]; then
		echo "Failed DIY $kind CLI e2e: $case_name (exit $status); see $stdout_file and $stderr_file" >&2
		exit 1
	fi

	echo "Passed DIY $kind CLI e2e: $case_name"
}

found_failure=0
for case_dir in "$ROOT_DIR/failure"/*; do
	if [ ! -d "$case_dir" ]; then
		continue
	fi
	run_case "$case_dir" "failure" 1
	found_failure=1
done

found_success=0
for case_dir in "$ROOT_DIR/success"/*; do
	if [ ! -d "$case_dir" ]; then
		continue
	fi
	run_case "$case_dir" "success" 0
	found_success=1
done

if [ "$found_failure" -eq 0 ]; then
	echo "No DIY CLI failure e2e cases found under $ROOT_DIR/failure" >&2
	exit 1
fi
if [ "$found_success" -eq 0 ]; then
	echo "No DIY CLI success e2e cases found under $ROOT_DIR/success" >&2
	exit 1
fi
