// The package index is deliberately three.js-free at runtime: the chart
// (and all WebGL code) loads lazily inside EmbeddingsView on first mount.
// Imperative hosts that want the chart eagerly import the "./chart"
// subpath — statically re-exporting it here would fold three.js back
// into every consumer's initial chunk.
export { buildColumns, colorsFromLabels, type Columns } from "./columns";
export { DEFAULT_SETTINGS, PALETTE } from "./constants";
export type {
  EmbeddingsChartCallbacks,
  EmbeddingsChartOptions,
} from "./EmbeddingsChart";
export {
  EmbeddingsView,
  type EmbeddingsViewHandle,
  type EmbeddingsViewProps,
} from "./EmbeddingsView";
export type {
  Bounds,
  CameraAdapter,
  CameraAdapterFactory,
  EmbeddingPoint,
  HoverHit,
  Polygon,
  RenderSettings,
} from "./types";
