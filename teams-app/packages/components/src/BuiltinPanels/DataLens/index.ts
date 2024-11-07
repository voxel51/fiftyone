import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { MainPanel } from "./MainPanel";
import CenterFocusWeakIcon from "@mui/icons-material/CenterFocusWeak";

registerComponent({
  name: "data_lens_panel",
  label: "Data Lens",
  component: MainPanel,
  type: PluginComponentType.Panel,
  Icon: CenterFocusWeakIcon,
  activator: () => true,
  panelOptions: {
    category: "import",
    beta: true,
    isNew: false,
  },
});
