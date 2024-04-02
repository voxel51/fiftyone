import { usePanelState } from "@fiftyone/spaces";
import { useEffect } from "react";
import { executeOperator } from "./operators";

export function CustomPanel({ panelId, onLoad, onUnLoad }) {
  const [panelState, setPanelState] = usePanelState(panelId);

  useEffect(() => {
    if (onLoad) executeOperator(onLoad, { panel_id: panelId });
    console.log("panelState", panelState);
    return () => {
      if (onUnLoad) executeOperator(onUnLoad, { panel_id: panelId });
    };
  }, []);

  return <pre>{JSON.stringify(panelState, null, 2)}</pre>;
}

export function defineCustomPanel(onLoad, onUnLoad) {
  return ({ panelId }) => (
    <CustomPanel panelId={panelId} onLoad={onLoad} onUnLoad={onUnLoad} />
  );
}
