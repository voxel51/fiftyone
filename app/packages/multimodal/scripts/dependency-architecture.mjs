import assert from "node:assert/strict";

const sourcePrefix = "packages/multimodal/src/";
const episodeProductionPrefix = `${sourcePrefix}views/episode/`;
const mcapWorkerEntrypoints = [
  `${sourcePrefix}adapters/mcap/worker/grid-preview-worker.ts`,
  `${sourcePrefix}adapters/mcap/worker/playback-worker.ts`,
];

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

function verifyEpisodeDomainDirection(dependencies) {
  const edgeCounts = new Map();

  for (const { dependency, module } of dependencies) {
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

function dependencyPath(dependencyBySource, start, matchesTarget) {
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

function verifyWorkerPlaybackIsolation(graph) {
  const dependencyBySource = new Map(
    graph.modules.map((module) => [module.source, module.dependencies]),
  );
  const workerPlaybackPaths = mcapWorkerEntrypoints.flatMap((entrypoint) => {
    const path = dependencyPath(dependencyBySource, entrypoint, (target) =>
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
}

function verifyGraphCoverage(graph, dependencies) {
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
}

export function verifyDependencyArchitecture(graph) {
  const dependencies = graph.modules.flatMap((module) =>
    module.dependencies.map((dependency) => ({ dependency, module })),
  );

  verifyEpisodeDomainDirection(dependencies);
  verifyWorkerPlaybackIsolation(graph);
  verifyGraphCoverage(graph, dependencies);
}
