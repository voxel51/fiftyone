const SRC = "^packages/embeddings-renderer/src/";

module.exports = {
  forbidden: [
    {
      // The package's central constraint: everything except the React
      // wrapper layer is vanilla three.js + DOM, so the core stays
      // usable (and testable) without React.
      name: "core-stays-react-free",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${SRC}(EmbeddingsView|ChartTooltip)\\.tsx$`,
      },
      to: { path: "^react$|node_modules/react(/|$)" },
    },
    {
      // math and columns are pure geometry/data — no three.js, no DOM
      // modules — so they stay directly unit-testable.
      name: "pure-modules-stay-pure",
      severity: "error",
      from: { path: `${SRC}(math|columns)(\\.test)?\\.ts$` },
      to: {
        path: `node_modules/three(/|$)|${SRC}(cameras|interaction)/|${SRC}(pipeline|shaders|EmbeddingsChart)\\.ts$`,
      },
    },
    {
      // Helper layers never import upward into their orchestrators
      name: "helpers-stay-below-the-chart",
      severity: "error",
      from: { path: `${SRC}(cameras|interaction)/` },
      to: {
        path: `${SRC}(EmbeddingsChart\\.ts|EmbeddingsView\\.tsx|ChartTooltip\\.tsx|pipeline\\.ts)$`,
      },
    },
    {
      // The GPU pass plumbing has no business in input handling
      name: "pipeline-and-shaders-stay-below-interaction",
      severity: "error",
      from: { path: `${SRC}(pipeline|shaders)\\.ts$` },
      to: { path: `${SRC}(cameras|interaction)/` },
    },
    {
      // This package uses three's core only. Alternative camera adapters
      // (which is where addons like controls come from) are injected by
      // hosts through the CameraAdapterFactory seam, not shipped here.
      name: "no-three-addons",
      severity: "error",
      from: { path: SRC },
      to: { path: "node_modules/three/examples" },
    },
  ],
  options: {
    // Keep react/three edges in the graph (unlike a bare package-path
    // includeOnly, which would silently disable the rules above that
    // target them), but never traverse beyond the first node_modules hop.
    includeOnly:
      "^(packages/embeddings-renderer/|node_modules/(react|three)(/|$))",
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
  },
};
