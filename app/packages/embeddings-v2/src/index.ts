import {
  Categories,
  PluginComponentType,
  registerComponent,
} from "@fiftyone/plugins";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";
import { lazy } from "react";
import TabIndicator from "./TabIndicator";

const EmbeddingsV2Panel = lazy(() => import("./EmbeddingsV2Panel"));

registerComponent({
  name: "Embeddings",
  label: "Embeddings",
  component: EmbeddingsV2Panel,
  type: PluginComponentType.Panel,
  activator: () => true,
  Icon: ScatterPlotIcon,
  panelOptions: {
    TabIndicator,
    priority: BUILT_IN_PANEL_PRIORITY_CONST,
    category: Categories.Curate,
  },
});

// The panel's extension seam: an edition registers its implementation at
// module load (see extensions.ts for the contract and its inert fallbacks)
export {
  registerEmbeddingsPanelExtension,
  type ColorColumnSource,
  type EmbeddingsPanelExtension,
  type ExtraInteractionMode,
  type GeometryLoader,
  type HoverAction,
  type LassoStageInput,
  type PanelMode,
  type PublishSelection,
  type RunColumnSource,
  type RunFeatures,
  type RunFeaturesContext,
  type SelectionDecorator,
  type SharedPlotProps,
} from "./extensions";

// What an extension composes against: the wire protocol's shapes, the shared
// color palette, hover/legend types, per-run stored settings, and the local
// color-field filter used by runs the extension does not own
export { categoryHex, MISSING_CATEGORY } from "./colors";
export type { HoverContent } from "./HoverCard";
export { legendLabels, type CategoricalFilter } from "./legendFilter";
export {
  idAt,
  type ColorMeta,
  type ColorResponse,
  type ColorValues,
  type IdColumn,
  type VisualizationRun,
} from "./protocol";
export type { EmbeddingPoint, HoverHit } from "./renderer";
export { useStoredRunSettings, writeRunSettings } from "./runSettings";
export { useLocalColorMask } from "./useLocalColorMask";
