import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { SpaceNodeJSON, usePanels, useSpaces } from "@fiftyone/spaces";
import { Space } from "@fiftyone/spaces/src/components";
import { FIFTYONE_MODAL_SPACES_ID } from "@fiftyone/state/src/constants";
import React, { useCallback, useMemo } from "react";
import { ModalSample } from "./ModalSamplePlugin";

const SAMPLE_MODAL_PLUGIN_NAME = "SampleModal";

export const ModalSpace = React.memo(() => {
  const panelsPredicate = useCallback(
    (panel) => panel.surfaces === "modal" || panel.surfaces === "grid modal",
    []
  );

  const allModalPlugins = usePanels(panelsPredicate);

  const defaultModalSpaces = useMemo(() => {
    const sortedPlugins = allModalPlugins.sort((a, b) => {
      if (a.name === SAMPLE_MODAL_PLUGIN_NAME) {
        return -1;
      }
      return a.name > b.name ? 1 : 0;
    });

    return {
      id: "root",
      children: sortedPlugins.map((modalPlugin) => ({
        id: `${modalPlugin.name}`,
        type: modalPlugin.name,
        children: [],
        ...modalPlugin.panelOptions,
      })),
      type: "panel-container",
      // `SampleModal` is the default modal plugin registered in `ModalContentPlugin.tsx`
      activeChild: "SampleModal",
    } as SpaceNodeJSON;
  }, [allModalPlugins]);

  const { spaces } = useSpaces(FIFTYONE_MODAL_SPACES_ID, defaultModalSpaces);

  return (
    <Space node={spaces.root} id={FIFTYONE_MODAL_SPACES_ID} archetype="modal" />
  );
});

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
