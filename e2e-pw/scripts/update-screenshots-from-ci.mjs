#!/usr/bin/env node
/**
 * Update committed screenshot baselines from a CI run's Playwright blob
 * reports. For every failed toHaveScreenshot assertion in the run, copies the
 * `-actual.png` attachment over the corresponding committed baseline.
 *
 * Usage:
 *   node scripts/update-screenshots-from-ci.mjs --run <run-id> [--write]
 *
 * Options:
 *   --run <id>      GitHub Actions run id (the caller "Pull Request" run)
 *   --repo <slug>   default: voxel51/fiftyone
 *   --suffix <s>    snapshot platform suffix, default: chromium-linux
 *   --write         apply the updates (default is a dry run that lists them)
 *
 * Requires `gh` (authenticated) and node_modules installed in e2e-pw.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const get = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
};

const runId = get("--run");
const repo = get("--repo", "voxel51/fiftyone");
const suffix = get("--suffix", "chromium-linux");
const write = args.includes("--write");

if (!runId) {
  console.error("--run <github-actions-run-id> is required");
  process.exit(1);
}

const e2eRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(path.join(tmpdir(), "pw-baselines-"));

try {
  console.log(`Downloading e2e-blob-* artifacts from ${repo} run ${runId}...`);
  execFileSync(
    "gh",
    ["run", "download", runId, "-R", repo, "-p", "e2e-blob-*", "-D", work],
    { stdio: "inherit" },
  );

  // Collect every shard's blob zip into one directory for a single merge
  const blobDir = path.join(work, "blobs");
  mkdirSync(blobDir);
  let zips = 0;
  for (const artifact of readdirSync(work)) {
    const artifactDir = path.join(work, artifact);
    if (artifactDir === blobDir) continue;
    for (const entry of readdirSync(artifactDir)) {
      if (!entry.endsWith(".zip")) continue;
      copyFileSync(
        path.join(artifactDir, entry),
        path.join(blobDir, `${artifact}-${entry}`),
      );
      zips++;
    }
  }
  if (!zips) {
    console.error("No blob report zips found in the run's artifacts");
    process.exit(1);
  }

  // The JSON reporter must write to a file: on a piped stdout the process
  // exits before the pipe drains and the report truncates at 64KB.
  const reportFile = path.join(work, "report.json");
  execFileSync(
    process.execPath,
    [
      path.join(e2eRoot, "node_modules", "playwright", "cli.js"),
      "merge-reports",
      "--reporter",
      "json",
      blobDir,
    ],
    {
      cwd: e2eRoot,
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile },
    },
  );
  const report = JSON.parse(readFileSync(reportFile, "utf8"));

  // spec.file is relative to the Playwright testDir (e2e-pw/src)
  const specRoot = path.join(e2eRoot, "src");
  const updates = new Map();
  const visitSuite = (suite) => {
    for (const child of suite.suites ?? []) visitSuite(child);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          for (const attachment of result.attachments ?? []) {
            if (!attachment.name.endsWith("-actual.png")) continue;
            if (!attachment.path || !existsSync(attachment.path)) {
              console.warn(`No file for attachment ${attachment.name}, skipping`);
              continue;
            }
            const base = attachment.name.slice(0, -"-actual.png".length);
            const baseline = path.join(
              specRoot,
              path.dirname(spec.file),
              `${path.basename(spec.file)}-snapshots`,
              `${base}-${suffix}.png`,
            );
            updates.set(baseline, attachment.path);
          }
        }
      }
    }
  };
  for (const suite of report.suites ?? []) visitSuite(suite);

  if (!updates.size) {
    console.log("No screenshot mismatches in this run — nothing to update.");
    process.exit(0);
  }

  for (const [baseline, actual] of updates) {
    const relative = path.relative(e2eRoot, baseline);
    if (!existsSync(baseline)) {
      console.warn(`New baseline (did not exist before): ${relative}`);
    }
    if (write) {
      mkdirSync(path.dirname(baseline), { recursive: true });
      copyFileSync(actual, baseline);
      console.log(`Updated ${relative}`);
    } else {
      console.log(`Would update ${relative}`);
    }
  }
  if (!write) {
    console.log(`\nDry run: ${updates.size} baseline(s). Re-run with --write to apply.`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
