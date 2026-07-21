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
