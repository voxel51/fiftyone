import { usePanelState } from "@fiftyone/spaces";
import { useEffect } from "react";
import { executeOperator } from "./operators";
import OperatorIO from "./OperatorIO";

export function CustomPanel({ panelId, onLoad, onUnLoad }) {
  const [panelState, setPanelState] = usePanelState(panelId);
  const renderableSchema = panelState?.schema;
  const data = panelState?.state;
  const handlePanelStateChange = (newState) => {
    console.log(newState);
  };

  useEffect(() => {
    if (onLoad) executeOperator(onLoad, { panel_id: panelId });
    console.log("panelState", panelState);
    return () => {
      if (onUnLoad) executeOperator(onUnLoad, { panel_id: panelId });
    };
  }, []);

  return (
    <OperatorIO
      schema={renderableSchema}
      onChange={handlePanelStateChange}
      data={data}
    />
  );
}

export function defineCustomPanel(onLoad, onUnLoad) {
  return ({ panelId }) => (
    <CustomPanel panelId={panelId} onLoad={onLoad} onUnLoad={onUnLoad} />
  );
}
