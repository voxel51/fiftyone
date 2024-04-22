import { CenteredStack } from "@fiftyone/components";
import {
  PanelSkeleton,
  usePanelState,
  useSetCustomPanelState,
} from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { Box, Typography } from "@mui/material";
import { merge } from "lodash";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import OperatorIO from "./OperatorIO";
import { PANEL_LOAD_TIMEOUT } from "./constants";
import { executeOperator } from "./operators";
import * as types from "./types";

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
  const [panelState, setPanelState] = usePanelState(null, panelId);
  const { height, width } = dimensions?.bounds || {};
  const setCustomPanelState = useSetCustomPanelState();
  const panelSchema = panelState?.schema;
  const data = getPanelViewData(panelState);
  const handlePanelStateChange = (newState) => {
    setCustomPanelState((state: any) => ({ ...state, ...newState }));
  };
  const pending = fos.useTimeout(PANEL_LOAD_TIMEOUT);
  const view = useRecoilValue(fos.view);

  useEffect(() => {
    if (onLoad) {
      if (!panelState?.loaded) {
        executeOperator(onLoad, { panel_id: panelId });
        setPanelState((s) => ({ ...s, loaded: true }));
      }
    }

    return () => {
      if (onUnLoad) {
        executeOperator(onUnLoad, { panel_id: panelId });
      }
    };
  }, [panelId, onLoad, onUnLoad]);

  useEffect(() => {
    if (onViewChange) {
      executeOperator(onViewChange, {
        panel_id: panelId,
        panel_state: panelState?.state,
      });
    }
  }, [view]);

  useEffect(() => {
    if (onChange && panelState?.state)
      executeOperator(onChange, {
        panel_id: panelId,
        panel_state: panelState.state,
      });
  }, [panelState?.state]);

  if (pending && !panelSchema) {
    return <PanelSkeleton />;
  }

  if (!panelSchema)
    return (
      <CenteredStack spacing={1}>
        <Typography variant="h3">Custom Panel</Typography>
        <Typography color="text.secondary">
          Custom panel is not configured yet.
        </Typography>
        <Typography component="pre" color="text.tertiary">
          {panelId}
        </Typography>
      </CenteredStack>
    );

  const schema = types.Property.fromJSON(panelSchema);

  return (
    <Box sx={{ height: "100%", width: "100%" }}>
      <OperatorIO
        schema={schema}
        onChange={handlePanelStateChange}
        data={data}
        layout={{ height, width }}
      />
    </Box>
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
