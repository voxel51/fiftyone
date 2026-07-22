import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { bin } from "./process.mjs";

console.log("Checking dependencies integrity for multimodal");

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const require = createRequire(import.meta.url);
const dependencyConfig = require("../.dependency-cruiser.cjs");
const namespacePath = /^\^packages\/multimodal\/src\/([\w-]+)\/$/;
const declaredNamespaces = new Set(
  dependencyConfig.forbidden.flatMap((rule) => {
    const match = namespacePath.exec(rule.from?.path);
    return match ? [match[1]] : [];
  }),
);
const topLevelNamespaces = readdirSync(new URL("../src/", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const undeclaredNamespaces = topLevelNamespaces.filter(
  (namespace) => !declaredNamespaces.has(namespace),
);

assert.equal(
  undeclaredNamespaces.length,
  0,
  `top-level namespaces need a direct dependency rule: ${undeclaredNamespaces.join(", ")}`,
);
console.log(
  `Verified ${topLevelNamespaces.length} top-level namespace dependency contracts`,
);

execFileSync(
  bin("yarn"),
  [
    "exec",
    "depcruise",
    "--config",
    "packages/multimodal/.dependency-cruiser.cjs",
    "packages/multimodal/src",
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
);

const graph = JSON.parse(
  execFileSync(
    bin("yarn"),
    [
      "exec",
      "depcruise",
      "--config",
      "packages/multimodal/.dependency-cruiser.cjs",
      "--output-type",
      "json",
      "packages/multimodal/src",
    ],
    { cwd: appRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);

const sourcePrefix = "packages/multimodal/src/";
const dependencies = graph.modules.flatMap((module) =>
  module.dependencies.map((dependency) => ({ dependency, module })),
);
const visibleVendorEdge = dependencies.find(
  ({ dependency, module }) =>
    module.source.startsWith(`${sourcePrefix}adapters/`) &&
    /(^|\/)node_modules\/(?:@mcap|@foxglove|hyparquet|mp4box)(\/|$)/.test(
      dependency.resolved,
    ),
);
const visibleWorkspaceEdge = dependencies.find(
  ({ dependency, module }) =>
    module.source.startsWith(`${sourcePrefix}views/`) &&
    dependency.resolved.startsWith("packages/playback/"),
);
const outsideTargets = graph.modules.filter(
  (module) => !module.source.startsWith(sourcePrefix),
);

assert(visibleVendorEdge, "dependency graph omitted format-vendor targets");
assert(visibleWorkspaceEdge, "dependency graph omitted workspace targets");
assert(
  outsideTargets.every(
    (module) => module.matchesDoNotFollow && module.dependencies.length === 0,
  ),
  "outside dependencies must remain visible leaves without being traversed",
);

console.log(
  `Verified ${outsideTargets.length} outside dependency targets as visible leaves`,
);
