import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { SAMPLE_MODAL_PLUGIN_NAME } from "../components/Modal/modal-spaces-utils";
import { ModalSample } from "../components/Modal/ModalSamplePlugin";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";

registerComponent({
  name: SAMPLE_MODAL_PLUGIN_NAME,
  component: ModalSample,
  label: "Sample",
  type: PluginComponentType.Panel,
  panelOptions: {
    surfaces: "modal",
    priority: BUILT_IN_PANEL_PRIORITY_CONST,
  },
  activator: () => true,
});
