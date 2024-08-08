import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { SAMPLE_MODAL_PLUGIN_NAME } from "../components/Modal/modal-spaces-utils";
import { ModalSample } from "../components/Modal/ModalSamplePlugin";

registerComponent({
  name: SAMPLE_MODAL_PLUGIN_NAME,
  component: ModalSample,
  label: "Sample",
  type: PluginComponentType.Panel,
  surfaces: "modal",
  panelOptions: {
    pinned: true,
  },
  activator: () => true,
});
