const PKG = "^packages/reverb/src/";

module.exports = {
  forbidden: [
    {
      // The store sits below every other App package, so it imports none of
      // them: an edge upward would make the store depend on its own users.
      name: "no-workspace-imports",
      severity: "error",
      from: { path: PKG },
      to: {
        path: "node_modules/@fiftyone(/|$)|^packages/",
        pathNot: "^packages/reverb/",
      },
    },
    {
      // type-only edges vanish at build time, so only runtime cycles count
      name: "no-circular",
      severity: "error",
      from: { path: PKG },
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ["type-only"] },
      },
    },
  ],
  options: {
    // Keep workspace edges in the graph so the rule above sees them, but
    // never traverse into node_modules or a sibling package's sources.
    includeOnly:
      "^(packages/|node_modules/(react|jotai|jotai-effect|@fiftyone)(/|$))",
    doNotFollow: { path: "node_modules|^packages/(?!reverb/)" },
    tsPreCompilationDeps: true,
  },
};
