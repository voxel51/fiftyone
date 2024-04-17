import { usePanelState, useSetCustomPanelState } from "@fiftyone/spaces";
import { useEffect, useState } from "react";
import { executeOperator } from "./operators";
import OperatorIO from "./OperatorIO";
import * as types from "./types";
import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { merge } from "lodash";

function getPanelViewData(panelState) {
  const state = panelState?.state;
  const data = panelState?.data;
  return merge({ ...state }, { ...data });
}

export function CustomPanel({
  panelId,
  onLoad,
  onChange,
  onUnLoad,
  onViewChange,
  dimensions,
}) {
  console.log("CustomPanel", panelId, onLoad);
  const [panelState, setPanelState] = usePanelState(null, panelId);
  const { height, width } = dimensions;
  const setCustomPanelState = useSetCustomPanelState();
  const renderableSchema = panelState?.schema;
  const data = getPanelViewData(panelState);
  const handlePanelStateChange = (newState) => {
    setCustomPanelState((state: any) => ({ ...state, ...newState }));
  };
  const [loaded, setLoaded] = useState(false);
  const view = useRecoilValue(fos.view);

  useEffect(() => {
    if (onLoad) {
      if (!panelState?.loaded) {
        executeOperator(onLoad, { panel_id: panelId });
        setPanelState((s) => ({ ...s, loaded: true }));
      }
    }

    return () => {
      if (onUnLoad) executeOperator(onUnLoad, { panel_id: panelId });
    };
  }, [panelId, onLoad, onUnLoad]);

  useEffect(() => {
    if (onViewChange)
      executeOperator(onViewChange, {
        panel_id: panelId,
        panel_state: panelState?.state,
      });
  }, [view]);

  useEffect(() => {
    if (onChange && panelState?.state)
      executeOperator(onChange, {
        panel_id: panelId,
        panel_state: panelState.state,
      });
  }, [panelState?.state]);

  if (!renderableSchema)
    return (
      <div>
        <h1>Custom Panel</h1>
        <p>Custom panel is not configured yet.</p>
        <pre>{panelId}</pre>
      </div>
    );

  const schema = types.Property.fromJSON(renderableSchema);

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <OperatorIO
        schema={{
          ...schema,
          view: {
            ...schema.view,
            componentsProps: {
              gridContainer: {
                spacing: 0,
                sx: { pl: 0 },
                height: height || 750,
                width,
              },
            },
          },
        }}
        onChange={handlePanelStateChange}
        data={data}
      />
    </div>
  );
}

export function defineCustomPanel({
  on_load,
  on_change,
  on_unload,
  on_view_change,
}) {
  return ({ panelNode, dimensions }) => (
    <CustomPanel
      panelId={panelNode?.id}
      onLoad={on_load}
      onUnLoad={on_unload}
      onChange={on_change}
      onViewChange={on_view_change}
      dimensions={dimensions}
    />
  );
}
