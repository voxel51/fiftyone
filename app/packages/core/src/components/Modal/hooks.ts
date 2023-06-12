import { useHelpPanel, useJSONPanel } from "@fiftyone/state";
import { useCallback } from "react";

export const usePanels = () => {
  const jsonPanel = useJSONPanel();
  const helpPanel = useHelpPanel();
  const onNavigate = useCallback(() => {
    jsonPanel.close();
    helpPanel.close();
  }, [helpPanel, jsonPanel]);

  return {
    jsonPanel,
    helpPanel,
    onNavigate,
  };
};
