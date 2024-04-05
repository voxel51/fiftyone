import { usePanelState, useSetCustomPanelState } from "@fiftyone/spaces";
import { useEffect } from "react";
import { executeOperator } from "./operators";
import OperatorIO from "./OperatorIO";
import * as types from "./types";

export function CustomPanel({ panelId, onLoad, onChange, onUnLoad }) {
  console.log("CustomPanel", panelId, onLoad);
  const [panelState, setPanelState] = usePanelState(null, panelId);
  const setCustomPanelState = useSetCustomPanelState();
  const renderableSchema = panelState?.schema;
  const data = panelState?.state;
  const handlePanelStateChange = (newState) => {
    setCustomPanelState((state: any) => ({ ...state, ...newState }));
  };

  useEffect(() => {
    if (onLoad) executeOperator(onLoad, { panel_id: panelId });
    console.log("panelState", panelState);
    return () => {
      if (onUnLoad) executeOperator(onUnLoad, { panel_id: panelId });
    };
  }, []);

  useEffect(() => {
    if (onChange && panelState?.state)
      executeOperator(onChange, {
        panel_id: panelId,
        panel_state: panelState.state,
      });
  }, [panelState?.state]);

  if (!renderableSchema) return null;

  const schema = types.Property.fromJSON(renderableSchema);

  return (
    <>
      <OperatorIO
        schema={schema}
        onChange={handlePanelStateChange}
        data={data}
      />
      <pre>{JSON.stringify(panelState, null, 2)}</pre>
    </>
  );
}

export function defineCustomPanel({ on_load, on_change, on_unload }) {
  return ({ panelNode }) => (
    <CustomPanel
      panelId={panelNode?.id}
      onLoad={on_load}
      onUnLoad={on_unload}
      onChange={on_change}
    />
  );
}
