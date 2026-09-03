// This barrel is deliberately three.js-free at runtime: the chart (and
// all WebGL code) loads lazily inside EmbeddingsView on first mount.
// Statically re-exporting the chart here would fold three.js back into
// the panel's initial chunk — which is why depcruise routes all panel
// imports through this file and nowhere deeper.
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
  CellMembership,
  EmbeddingPoint,
  HoverHit,
  InteractionMode,
  Polygon,
  RenderSettings,
} from "./types";
