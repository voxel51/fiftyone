import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { bin } from "./process.mjs";

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

const cruiseArgs = [
  "exec",
  "depcruise",
  "--config",
  "packages/multimodal/.dependency-cruiser.cjs",
  "packages/multimodal/src",
];
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
  spawnSync(bin("yarn"), cruiseArgs, { cwd: appRoot, stdio: "inherit" });
  process.exit(cruise.status ?? 1);
}

const graph = JSON.parse(cruise.stdout);

const sourcePrefix = "packages/multimodal/src/";
const dependencies = graph.modules.flatMap((module) =>
  module.dependencies.map((dependency) => ({ dependency, module })),
);

const episodeProductionPrefix = `${sourcePrefix}views/episode/`;

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

  const bidirectionalEdges = [...edgeCounts.entries()]
    .filter(([key]) => {
      const [from, to] = key.split("->");
      return edgeCounts.has(`${to}->${from}`);
    })
    .sort(([left], [right]) => left.localeCompare(right));

  assert.equal(
    bidirectionalEdges.length,
    0,
    `episode domains must not depend on each other in both directions:\n${bidirectionalEdges
      .map(([key, count]) => `  ${key}: ${count}`)
      .join("\n")}`,
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

console.log("Multimodal dependency architecture verified");
