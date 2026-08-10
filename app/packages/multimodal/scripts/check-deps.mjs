import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { bin } from "./process.mjs";
import { dependencyCruiserGate } from "./dependency-cruiser-gate.mjs";

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

const mcapDirectory = new URL("../src/adapters/mcap/", import.meta.url);
const mcapStratumRules = dependencyConfig.forbidden.filter((rule) =>
  /^mcap-.*-imports?-only-/.test(rule.name),
);
const mcapStrata = readdirSync(mcapDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const undeclaredMcapStrata = mcapStrata.filter((stratum) => {
  const path = `packages/multimodal/src/adapters/mcap/${stratum}/`;
  return !mcapStratumRules.some((rule) => new RegExp(rule.from.path).test(path));
});

assert.equal(
  undeclaredMcapStrata.length,
  0,
  `MCAP directories need an import-stratum rule: ${undeclaredMcapStrata.join(", ")}`,
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
const gate = dependencyCruiserGate(graph);
if (gate.exitCode !== 0) {
  const report = spawnSync(
    bin("yarn"),
    [...cruiseArgs, "--output-type", "err"],
    { cwd: appRoot, stdio: "inherit" },
  );
  if (report.error) throw report.error;
  console.error(
    `Multimodal dependency architecture failed: ${gate.error} error(s), ${gate.warn} warning(s)`,
  );
  process.exit(gate.exitCode);
}

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

const dependencyBySource = new Map(
  graph.modules.map((module) => [module.source, module.dependencies]),
);
const mcapWorkerEntrypoints = [
  `${sourcePrefix}adapters/mcap/worker/grid-preview-worker.ts`,
  `${sourcePrefix}adapters/mcap/worker/playback-worker.ts`,
];

function dependencyPath(start, matchesTarget) {
  const pending = [start];
  const predecessor = new Map([[start, null]]);

  while (pending.length > 0) {
    const source = pending.shift();
    for (const dependency of dependencyBySource.get(source) ?? []) {
      const target = dependency.resolved;
      if (predecessor.has(target)) continue;
      predecessor.set(target, source);
      if (matchesTarget(target)) {
        const path = [target];
        let cursor = source;
        while (cursor !== null) {
          path.push(cursor);
          cursor = predecessor.get(cursor) ?? null;
        }
        return path.reverse();
      }
      pending.push(target);
    }
  }

  return null;
}

const workerPlaybackPaths = mcapWorkerEntrypoints.flatMap((entrypoint) => {
  const path = dependencyPath(entrypoint, (target) =>
    target.startsWith("packages/playback/"),
  );
  return path ? [path] : [];
});
assert.equal(
  workerPlaybackPaths.length,
  0,
  `MCAP workers must not load the host playback package:\n${workerPlaybackPaths
    .map((path) => `  ${path.join(" -> ")}`)
    .join("\n")}`,
);

// Whole-manifest view reads must use the source-budgeted progressive history
// substrate. Keep the empty allowlist explicit so regressions fail this check.
const legacyManifestWideReads = new Map();
const discoveredManifestWideReads = new Map();
for (const module of graph.modules) {
  const source = module.source;
  if (
    !source.startsWith(episodeProductionPrefix) ||
    !/\.[cm]?[jt]sx?$/.test(source) ||
    /\.(?:bench|spec|test)\.[cm]?[jt]sx?$/.test(source)
  ) {
    continue;
  }
  const contents = readFileSync(
    new URL(`../../../${source}`, import.meta.url),
    {
      encoding: "utf8",
    },
  );
  if (!contents.includes("session.read(")) continue;
  const count = contents.match(/session\.manifest\.timeRange/g)?.length ?? 0;
  if (count > 0) {
    discoveredManifestWideReads.set(source, count);
  }
}
assert.deepEqual(
  discoveredManifestWideReads,
  legacyManifestWideReads,
  "new manifest-wide view reads must use a source-budgeted bounded-read job",
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

console.log("Multimodal dependency architecture verified");
