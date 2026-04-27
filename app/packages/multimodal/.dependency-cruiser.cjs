module.exports = {
  forbidden: [
    {
      name: "only-mcap-and-inject-entry-can-import-mcap",
      severity: "error",
      from: {
        path: "^packages/multimodal/src/",
        pathNot: "^packages/multimodal/src/(mcap/|inject/index\\.ts$)",
      },
      to: { path: "^packages/multimodal/src/mcap/" },
    },
  ],
  options: {
    includeOnly: "^packages/multimodal/",
    tsPreCompilationDeps: true,
  },
};
