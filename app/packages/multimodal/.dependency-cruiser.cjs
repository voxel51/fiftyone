const SRC = "^packages/multimodal/src/";
const ENTERPRISE = `${SRC}enterprise/`;
const INJECT_ENTRY = `${SRC}inject/index\\.ts$`;
const ENTERPRISE_SHARED_FACADES =
  `${SRC}(extensions/mcap/(index|runtime)\\.ts$|` +
  `query/bytes/index\\.ts$|visualization/index\\.ts$)`;
const MCAP = `${SRC}adapters/mcap/`;

module.exports = {
  forbidden: [
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
      name: "only-mcap-adapters-extensions-and-inject-entry-can-import-mcap",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${SRC}(adapters/mcap/|extensions/mcap/|inject/index\\.ts$)`,
      },
      to: { path: MCAP },
    },
    {
      name: "multimodal-does-not-import-teams",
      severity: "error",
      from: { path: SRC },
      to: { path: `${SRC}teams/|^teams-app/|@fiftyone/teams-multimodal` },
    },
    {
      name: "generic-multimodal-layers-do-not-import-adapters",
      severity: "error",
      from: { path: `${SRC}(decoders|query|schemas|visualization)(/|$)` },
      to: { path: `${SRC}adapters/` },
    },
    {
      name: "decoders-do-not-import-query",
      severity: "error",
      from: { path: `${SRC}decoders/` },
      to: { path: `${SRC}query/` },
    },
    {
      name: "only-inject-imports-mcap-entry",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${SRC}(inject/index\\.ts$|adapters/mcap/entry\\.tsx$)`,
      },
      to: { path: `${MCAP}entry\\.tsx$` },
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
