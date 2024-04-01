import { usePanelState } from "@fiftyone/spaces";
import { useEffect } from "react";
import { executeOperator } from "./operators";

export function CustomPanel({ panelId, onLoad }) {
  const [panelState, setPanelState] = usePanelState(panelId);

  useEffect(() => {
    executeOperator(onLoad, { panel_id: panelId });
    console.log("panelState", panelState);
  }, []);

  return <pre>{JSON.stringify(panelState, null, 2)}</pre>;
}

export function defineCustomPanel(onLoad) {
  return ({ panelId }) => <CustomPanel panelId={panelId} onLoad={onLoad} />;
}
