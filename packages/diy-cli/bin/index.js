#!/usr/bin/env node
const { runCli } = require("../dist-cli/cli.js");

runCli().catch((error) => {
	if (error instanceof Error) {
		process.stderr.write(`${error.message}\n`);
	} else {
		process.stderr.write(`${String(error)}\n`);
	}
	process.exitCode = 1;
});
