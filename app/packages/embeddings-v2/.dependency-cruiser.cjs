const PKG = "^packages/embeddings-v2/src/";
const SRC = "^packages/embeddings-v2/src/renderer/";

module.exports = {
  forbidden: [
    {
      // The dependency direction is edition → this package, never back:
      // multimodal semantics live in @fiftyone/multimodal, which imports
      // this library — an edge the other way is a layering inversion.
      name: "no-multimodal-imports",
      severity: "error",
      from: { path: PKG },
      to: { path: "node_modules/@fiftyone/multimodal(/|$)|^packages/multimodal/" },
    },
    {
      // The renderer was a standalone package before it merged into the
      // panel; these three boundary rules preserve that shape. First:
      // panel code reaches the renderer only through its barrel — the
      // barrel is three.js-free at runtime (EmbeddingsView lazy-loads
      // the chart), so a deep import could silently pull WebGL code
      // into the panel's initial chunk.
      name: "panel-uses-the-renderer-barrel",
      severity: "error",
      from: { path: PKG, pathNot: SRC },
      to: { path: SRC, pathNot: `${SRC}index\\.ts$` },
    },
    {
      // Second: the renderer is host-agnostic — no imports upward into
      // the panel, so it stays extractable (and Teams-reusable) as-is.
      name: "renderer-stays-below-the-panel",
      severity: "error",
      from: { path: SRC },
      to: { path: PKG, pathNot: SRC },
    },
    {
      // Third: the renderer keeps zero workspace dependencies — three
      // is its only runtime dep; React appears solely in the wrapper
      // layer via the host.
      name: "renderer-keeps-no-workspace-deps",
      severity: "error",
      from: { path: SRC },
      to: {
        path: "node_modules/@fiftyone(/|$)|^packages/",
        pathNot: "^packages/embeddings-v2/",
      },
    },
    {
      // The renderer's central constraint: everything except the React
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
      // The renderer uses three's core only. Alternative camera adapters
      // (which is where addons like controls come from) are injected by
      // hosts through the CameraAdapterFactory seam, not shipped here.
      name: "no-three-addons",
      severity: "error",
      from: { path: SRC },
      to: { path: "node_modules/three/examples" },
    },
  ],
  options: {
    // Keep react/three/workspace edges in the graph (a bare package-path
    // includeOnly would silently disable the rules above that target
    // them), but never traverse beyond the first hop into node_modules
    // or a sibling package's sources.
    includeOnly: "^(packages/|node_modules/(react|three|@fiftyone)(/|$))",
    doNotFollow: { path: "node_modules|^packages/(?!embeddings-v2/)" },
    tsPreCompilationDeps: true,
  },
};
