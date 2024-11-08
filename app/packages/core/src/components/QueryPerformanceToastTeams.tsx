import QueryPerformanceToast from "./QueryPerformanceToast";
import React, { useState } from "react";
import { usePromptOperatorInput } from "@fiftyone/operators/src/state";
import { useSpaces, useSpaceNodes, SpaceNode } from "@fiftyone/spaces";
import { usePanelEvent } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";

const QueryPerformanceToastTeams = () => {
  const [path, setPath] = useState<string | undefined>(undefined);
  const promptForOperator = usePromptOperatorInput();
  const { FIFTYONE_GRID_SPACES_ID } = fos.constants;
  const { spaces } = useSpaces(FIFTYONE_GRID_SPACES_ID);
  const openedPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
  const PANEL_NAME = "query_performance_panel";
  const triggerPanelEvent = usePanelEvent();

  const onDispatch = (event) => {
    setPath(event.path);
  };

  const onClick = (isFrameFilter: boolean) => {
    let openedPanel = openedPanels.find(({ type }) => type === PANEL_NAME);
    if (!openedPanel) {
      openedPanel = new SpaceNode();
      openedPanel.type = PANEL_NAME;
      spaces.addNodeAfter(spaces.root, openedPanel, true);
    }
    spaces.setNodeActive(openedPanel);
    if (path) {
      promptForOperator(
        "index_field_creation_operator",
        { nonperformant_field: path, is_frame_filter: isFrameFilter },
        {
          callback: () => {
            triggerPanelEvent(openedPanel.id, {
              operator: PANEL_NAME + "#refresh",
            });
          },
        }
      );
    }
  };

  return (
    <QueryPerformanceToast
      onClick={onClick}
      onDispatch={onDispatch}
      text="Create an Index"
    />
  );
};

export default QueryPerformanceToastTeams;
