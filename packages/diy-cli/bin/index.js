#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runCli } = require("../dist-cli/cli.cjs");

runCli().catch((error) => {
	if (error instanceof Error) {
		process.stderr.write(`${error.message}\n`);
	} else {
		process.stderr.write(`${String(error)}\n`);
	}
	process.exitCode = 1;
});
