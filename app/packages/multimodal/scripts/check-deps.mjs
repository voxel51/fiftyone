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

const episodeProductionPrefix = `${sourcePrefix}views/episode/`;
// Temporary upper bounds for production module edges between episode domains
// that still depend on one another in both directions. Lower a bound whenever
// a migration removes an edge, and delete both directions once the pair is no
// longer bidirectional.
const episodeDomainBudget = Object.freeze({});

function episodeProductionDomain(source) {
  if (
    !source.startsWith(episodeProductionPrefix) ||
    !/\.[cm]?[jt]sx?$/.test(source) ||
    /(?:^|\/)(?:__tests__|testing)(?:\/|$)/.test(source) ||
    /\.(?:bench|spec|test)\.[cm]?[jt]sx?$/.test(source)
  ) {
    return null;
  }

  return source.slice(episodeProductionPrefix.length).split("/", 1)[0] ?? null;
}

function verifyEpisodeDomainDirection(edges) {
  const edgeCounts = new Map();

  for (const { dependency, module } of edges) {
    const from = episodeProductionDomain(module.source);
    const to = episodeProductionDomain(dependency.resolved);
    if (!from || !to || from === to) continue;

    const key = `${from}->${to}`;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  }

  const reversePairs = [...edgeCounts.entries()]
    .filter(([key]) => {
      const [from, to] = key.split("->");
      return edgeCounts.has(`${to}->${from}`);
    })
    .sort(([left], [right]) => left.localeCompare(right));
  const missingBudgets = reversePairs.filter(
    ([key]) => !Object.hasOwn(episodeDomainBudget, key),
  );
  assert.equal(
    missingBudgets.length,
    0,
    `new bidirectional episode-domain edges need an explicit migration budget:\n${missingBudgets
      .map(([key, count]) => `  ${key}: ${count}`)
      .join("\n")}`,
  );

  for (const [key, budget] of Object.entries(episodeDomainBudget)) {
    const actual = edgeCounts.get(key) ?? 0;
    assert(
      actual <= budget,
      `${key} has ${actual} production module edges; migration budget is ${budget}`,
    );

    const [from, to] = key.split("->");
    assert(
      edgeCounts.has(`${to}->${from}`),
      `${key} is no longer bidirectional; delete its migration budget`,
    );
  }

  console.log(
    `Verified episode domain direction with ${reversePairs.length / 2} temporary bidirectional pair budgets`,
  );
}

verifyEpisodeDomainDirection(dependencies);
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
