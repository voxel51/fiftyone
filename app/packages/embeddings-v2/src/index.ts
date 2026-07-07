import {
  Categories,
  PluginComponentType,
  registerComponent,
} from "@fiftyone/plugins";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";
import { lazy } from "react";

const EmbeddingsV2Panel = lazy(() => import("./EmbeddingsV2Panel"));

registerComponent({
  name: "EmbeddingsV2",
  label: "Embeddings v2",
  component: EmbeddingsV2Panel,
  type: PluginComponentType.Panel,
  activator: () => true,
  Icon: ScatterPlotIcon,
  panelOptions: {
    priority: BUILT_IN_PANEL_PRIORITY_CONST,
    category: Categories.Curate,
  },
});
