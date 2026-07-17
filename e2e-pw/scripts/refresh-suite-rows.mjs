// Rewrites the suite rows of an existing authoritative e2e comment with
// each suite's concluded state. The comment is posted when the e2e verdict
// completes, which often precedes slower siblings like test-windows, so
// their rows freeze at ⏳ without this refresh.
//
// usage: node refresh-suite-rows.mjs <run-jobs.json> <comment-body.md>
// Prints the refreshed body (unchanged if the comment has no suite table).

import { readFileSync } from "node:fs";

import { buildSuiteRows } from "./suite-rows.mjs";

const [, , jobsPath, bodyPath] = process.argv;
if (!jobsPath || !bodyPath) {
  console.error("usage: node refresh-suite-rows.mjs <run-jobs.json> <body.md>");
  process.exit(1);
}

const body = readFileSync(bodyPath, "utf8");
const lines = body.split("\n");
const header = lines.indexOf("| suite | result |");
const e2eRow = lines.findIndex((l) => l.startsWith("| e2e |"));
if (header === -1 || e2eRow < header + 2) {
  process.stdout.write(body);
  process.exit(0);
}

const jobs = JSON.parse(readFileSync(jobsPath, "utf8")).jobs ?? [];
lines.splice(header + 2, e2eRow - header - 2, ...buildSuiteRows(jobs));
process.stdout.write(lines.join("\n"));
