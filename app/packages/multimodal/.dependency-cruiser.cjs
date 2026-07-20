const SRC = "^packages/multimodal/src/";
const ENTERPRISE = `${SRC}enterprise/`;
const INJECT_ENTRY = `${SRC}inject/index\\.ts$`;
const ENTERPRISE_SHARED_FACADES =
  `${SRC}(extensions/timeline/(index|runtime)\\.ts$|` +
  `query/bytes/index\\.ts$|visualization/index\\.ts$)`;
const MCAP = `${SRC}adapters/mcap/`;
const IR = `${SRC}ir/`;
const PORTS = `${SRC}ports/`;
const ADAPTERS = `${SRC}adapters/`;
const FORMAT_VENDORS = "^(@mcap/|@foxglove/|hyparquet$|mp4box$)";

module.exports = {
  forbidden: [
    {
      name: "ir-is-a-leaf",
      severity: "error",
      from: { path: IR },
      to: { path: SRC, pathNot: IR },
    },
    {
      name: "ports-import-only-ir",
      severity: "error",
      from: { path: PORTS },
      to: { path: SRC, pathNot: `${SRC}(ports|ir)/` },
    },
    {
      name: "only-adapters-import-format-vendors",
      severity: "error",
      from: { path: SRC, pathNot: ADAPTERS },
      to: { path: FORMAT_VENDORS },
    },
    {
      name: "adapters-do-not-import-other-adapters",
      severity: "error",
      from: { path: `${SRC}adapters/([^/]+)/` },
      to: { path: ADAPTERS, pathNot: `${SRC}adapters/$1/` },
    },
    {
      name: "adapters-do-not-import-shell",
      severity: "error",
      from: {
        path: ADAPTERS,
        pathNot: `${ADAPTERS}.*\\.test\\.[jt]sx?$`,
      },
      to: {
        path: `${SRC}(views|components|extensions|visualization|runtime|scene-inventory|temporal-tags)/`,
      },
    },
    {
      name: "agnostic-renderers-cannot-reach-an-adapter",
      severity: "error",
      from: {
        path:
          `${SRC}views/(EpisodeSessionRenderer\\.tsx$|` +
          `episode/(EpisodeModalRenderer|GridRenderer)\\.tsx$)`,
      },
      to: { path: ADAPTERS, reachable: true },
    },
    {
      name: "shared-multimodal-does-not-import-enterprise",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${SRC}(enterprise/|inject/index\\.ts$)`,
      },
      to: { path: ENTERPRISE },
    },
    {
      name: "inject-entry-imports-only-enterprise-entry",
      severity: "error",
      from: { path: INJECT_ENTRY },
      to: {
        path: ENTERPRISE,
        pathNot: `${ENTERPRISE}inject\\.ts$`,
      },
    },
    {
      name: "enterprise-imports-shared-only-through-facades",
      severity: "error",
      from: { path: ENTERPRISE },
      to: {
        path: SRC,
        pathNot: `${ENTERPRISE}|${ENTERPRISE_SHARED_FACADES}`,
      },
    },
    {
      name: "agnostic-layers-do-not-import-adapters",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${SRC}(adapters/|inject/index\\.ts$|testing/integration/)`,
      },
      to: { path: ADAPTERS },
    },
    {
      name: "shared-layers-do-not-import-the-composition-root",
      severity: "error",
      from: { path: SRC, pathNot: INJECT_ENTRY },
      to: { path: INJECT_ENTRY },
    },
    {
      name: "multimodal-does-not-import-teams",
      severity: "error",
      from: { path: SRC },
      to: { path: `${SRC}teams/|^teams-app/|@fiftyone/teams-multimodal` },
    },
    {
      name: "decoders-do-not-import-query",
      severity: "error",
      from: { path: `${SRC}decoders/` },
      to: { path: `${SRC}query/` },
    },
    {
      name: "only-inject-imports-view-entry",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${SRC}(inject/index\\.ts$|views/entry\\.tsx$)`,
      },
      to: { path: `${SRC}views/entry\\.tsx$` },
    },
    {
      name: "mcap-resources-do-not-import-worker",
      severity: "error",
      from: { path: `${MCAP}resources/` },
      to: { path: `${MCAP}worker/` },
    },
    {
      name: "mcap-resources-stay-below-adapter-facade",
      severity: "error",
      from: { path: `${MCAP}resources/` },
      to: {
        path: `${MCAP}(react/|index\\.ts$|resource-client\\.ts$)`,
      },
    },
    {
      name: "mcap-core-layers-do-not-import-renderers",
      severity: "error",
      from: { path: `${MCAP}(decoders|reader|resources|worker)(/|$)` },
      to: {
        path: `${MCAP}(react/|entry\\.tsx$)`,
      },
    },
    {
      name: "mcap-worker-does-not-import-renderer-facade",
      severity: "error",
      from: { path: `${MCAP}worker/` },
      to: {
        path: `${MCAP}(react/|entry\\.tsx$|index\\.ts$|resource-client\\.ts$)`,
      },
    },
    {
      name: "mcap-reader-stays-below-resource-orchestration",
      severity: "error",
      from: { path: `${MCAP}reader/` },
      to: {
        path: `${MCAP}(resources/|worker/|react/|entry\\.tsx$|index\\.ts$|resource-client\\.ts$)`,
      },
    },
    {
      name: "mcap-decoders-stay-below-reader-and-resources",
      severity: "error",
      from: { path: `${MCAP}decoders/` },
      to: {
        path: `${MCAP}(reader/|resources/|worker/|react/|entry\\.tsx$|index\\.ts$|resource-client\\.ts$)`,
      },
    },
    {
      name: "schemas-do-not-import-runtime-layers",
      severity: "error",
      from: { path: `${SRC}schemas/` },
      to: { path: `${SRC}(adapters|decoders|query|visualization)/` },
    },
  ],
  options: {
    includeOnly: "^packages/multimodal/",
    tsPreCompilationDeps: true,
  },
};
