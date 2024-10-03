import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import Debugger from "./Debugger";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";

export { default as useDebugger } from "./useDebugger";

registerComponent({
  name: "debugger",
  label: "Debugger",
  component: Debugger,
  type: PluginComponentType.Panel,
  activator: () => true,
  Icon: ScatterPlotIcon,
  panelOptions: {
    priority: BUILT_IN_PANEL_PRIORITY_CONST,
  },
});
