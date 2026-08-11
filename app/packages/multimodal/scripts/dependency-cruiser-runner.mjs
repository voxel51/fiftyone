import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { bin } from "./process.mjs";

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const cruiseArgs = [
  "exec",
  "depcruise",
  "--config",
  "packages/multimodal/.dependency-cruiser.cjs",
  "packages/multimodal/src",
];

export function loadDependencyGraph() {
  const cruise = spawnSync(
    bin("yarn"),
    [...cruiseArgs, "--output-type", "json"],
    {
      cwd: appRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (cruise.error) throw cruise.error;
  if (cruise.status !== 0) {
    reportDependencyCruiserViolations();
    process.exit(cruise.status ?? 1);
  }

  return JSON.parse(cruise.stdout);
}

export function reportDependencyCruiserViolations() {
  const report = spawnSync(
    bin("yarn"),
    [...cruiseArgs, "--output-type", "err"],
    { cwd: appRoot, stdio: "inherit" },
  );
  if (report.error) throw report.error;
}
