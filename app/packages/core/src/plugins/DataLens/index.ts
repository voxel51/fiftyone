import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import { MainPanel } from "./MainPanel";

registerComponent({
  name: "data_lens_panel",
  label: "Data Lens",
  component: MainPanel,
  type: PluginComponentType.Panel,
  Icon: ImageSearchIcon,
  activator: () => true,
});
