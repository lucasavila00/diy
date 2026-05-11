#!/usr/bin/env bash
set -u
set -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$ROOT_DIR/node_modules/.bin:$PATH"

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
	local graph_file="$case_dir/module-graph.txt"
	local status
	local -a command

	if [ ! -d "$case_dir" ] || [ "$case_name" = "node_modules" ]; then
		return
	fi

	echo "Running DIY $kind CLI e2e: $case_name"
	echo "  writing stdout to: $stdout_file"
	echo "  writing stderr to: $stderr_file"
	if [ "$kind" = "success" ]; then
		echo "  writing module graph to: $graph_file"
	fi

	if [ -f "$case_dir/command.sh" ]; then
		command=(bash command.sh)
	else
		command=(diy-cli -p diy.json)
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

	if [ "$kind" = "success" ]; then
		if (cd "$case_dir" && diy-cli --graph -p diy.json) >"$graph_file" 2>"$stderr_file"; then
			status=0
		else
			status=$?
		fi
		if [ "$status" -ne 0 ]; then
			echo "Failed DIY success CLI graph e2e: $case_name (exit $status); see $graph_file and $stderr_file" >&2
			exit 1
		fi
	fi

	echo "Passed DIY $kind CLI e2e: $case_name"
}

run_cases() {
	local kind="$1"
	local expected_status="$2"
	local found=0

	for case_dir in "$ROOT_DIR/$kind"/*; do
		if [ ! -d "$case_dir" ]; then
			continue
		fi
		run_case "$case_dir" "$kind" "$expected_status"
		found=1
	done

	if [ "$found" -eq 0 ]; then
		echo "No DIY CLI $kind e2e cases found under $ROOT_DIR/$kind" >&2
		exit 1
	fi
}

run_cases "failure" 1
run_cases "success" 0
