import {
  Categories,
  PluginComponentType,
  registerComponent,
} from "@fiftyone/plugins";
import { MuiWorkspacesIcon as WorkspacesIcon } from "@fiftyone/components";
import { lazy } from "react";
import EmbeddingsTabIndicator from "./EmbeddingsTabIndicator";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";

const Embeddings = lazy(() => import("./Embeddings"));

registerComponent({
  name: "Embeddings",
  label: "Embeddings",
  component: Embeddings,
  type: PluginComponentType.Panel,
  activator: () => true,
  Icon: WorkspacesIcon,
  panelOptions: {
    TabIndicator: EmbeddingsTabIndicator,
    priority: BUILT_IN_PANEL_PRIORITY_CONST,
    category: Categories.Curate,
  },
});
