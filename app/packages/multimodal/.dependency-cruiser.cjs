const SRC = "^packages/multimodal/src/";
const MCAP = `${SRC}adapters/mcap/`;

module.exports = {
  forbidden: [
    {
      name: "only-mcap-adapter-and-inject-entry-can-import-mcap",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${SRC}(adapters/mcap/|inject/index\\.ts$)`,
      },
      to: { path: MCAP },
    },
    {
      name: "generic-multimodal-layers-do-not-import-adapters",
      severity: "error",
      from: { path: `${SRC}(client|decoders|schemas|visualization)(/|$)` },
      to: { path: `${SRC}adapters/` },
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
        path: `${MCAP}(hooks|index|resource-client)\\.tsx?$`,
      },
    },
    {
      name: "mcap-core-layers-do-not-import-renderers",
      severity: "error",
      from: { path: `${MCAP}(decoders|reader|resources|worker)(/|$)` },
      to: {
        path: `${MCAP}(GridRenderer|ModalRenderer|entry)\\.tsx?$`,
      },
    },
    {
      name: "mcap-worker-does-not-import-renderer-facade",
      severity: "error",
      from: { path: `${MCAP}worker/` },
      to: {
        path: `${MCAP}(GridRenderer|ModalRenderer|entry|hooks|index|resource-client)\\.tsx?$`,
      },
    },
    {
      name: "mcap-reader-stays-below-resource-orchestration",
      severity: "error",
      from: { path: `${MCAP}reader/` },
      to: {
        path: `${MCAP}(resources/|worker/|GridRenderer\\.tsx$|ModalRenderer\\.tsx$|entry\\.tsx$|hooks\\.ts$|index\\.ts$|resource-client\\.ts$)`,
      },
    },
    {
      name: "mcap-decoders-stay-below-reader-and-resources",
      severity: "error",
      from: { path: `${MCAP}decoders/` },
      to: {
        path: `${MCAP}(reader/|resources/|worker/|GridRenderer\\.tsx$|ModalRenderer\\.tsx$|entry\\.tsx$|hooks\\.ts$|index\\.ts$|resource-client\\.ts$)`,
      },
    },
    {
      name: "client-resources-do-not-import-queries-or-hooks",
      severity: "error",
      from: { path: `${SRC}client/resources/` },
      to: { path: `${SRC}client/(queries|hooks)/` },
    },
    {
      name: "client-queries-do-not-import-hooks",
      severity: "error",
      from: { path: `${SRC}client/queries/` },
      to: { path: `${SRC}client/hooks/` },
    },
    {
      name: "schemas-do-not-import-runtime-layers",
      severity: "error",
      from: { path: `${SRC}schemas/` },
      to: { path: `${SRC}(adapters|client|decoders|visualization)/` },
    },
  ],
  options: {
    includeOnly: "^packages/multimodal/",
    tsPreCompilationDeps: true,
  },
};
