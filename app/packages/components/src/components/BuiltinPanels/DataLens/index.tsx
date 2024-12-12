import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import CenterFocusWeakIcon from "@mui/icons-material/CenterFocusWeak";
import React, { Fragment } from "react";
import { PanelWrapper } from "./PanelWrapper";

registerComponent({
  name: "data_lens_panel",
  label: "Data Lens",
  component: PanelWrapper,
  type: PluginComponentType.Panel,
  Icon: CenterFocusWeakIcon,
  activator: () => true,
  panelOptions: {
    category: "import",
    beta: true,
    isNew: false,
  },
});

export const DataLens = () => <Fragment />;
export default DataLens;
