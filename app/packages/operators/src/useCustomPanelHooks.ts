import { useState, useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import { merge, isEqual } from "lodash";

import { usePanelState, useSetCustomPanelState } from "@fiftyone/spaces";
import { executeOperator } from "./operators";
import * as fos from "@fiftyone/state";
import usePanelEvent from "./usePanelEvent";
import { panelsStateUpdatesCountAtom } from "./state";

export interface CustomPanelProps {
  panelId: string;
  onLoad?: Function;
  onChange?: Function;
  onUnLoad?: Function;
  onViewChange?: Function;
  dimensions: {
    bounds: {
      height?: number;
      width?: number;
    };
  } | null;
  panelName?: string;
  panelLabel?: string;
}

export interface CustomPanelHooks {
  panelState: any;
  handlePanelStateChange: Function;
  handlePanelStatePathChange: Function;
  data: any;
  renderableSchema: any;
  loaded: boolean;
}

export function useCustomPanelHooks(props: CustomPanelProps): CustomPanelHooks {
  const { panelId } = props;
  const [panelState, setPanelState] = usePanelState(null, panelId);
  const setCustomPanelState = useSetCustomPanelState();
  const data = getPanelViewData(panelState);
  const renderableSchema = panelState?.schema;
  const [loaded] = useState(false);
  const view = useRecoilValue(fos.view);
  const panelsStateUpdatesCount = useRecoilValue(panelsStateUpdatesCountAtom);
  const lastPanelLoadState = useRef({
    count: panelsStateUpdatesCount,
    state: panelState,
  });

  useEffect(() => {
    log("CustomPanel loaded", panelId, props.onLoad);
    if (props.onLoad && !panelState?.loaded) {
      executeOperator(props.onLoad, { panel_id: panelId });
      setPanelState((s) => ({ ...s, loaded: true }));
    }

    return () => {
      if (props.onUnLoad)
        executeOperator(props.onUnLoad, { panel_id: panelId });
    };
  }, [panelId, props.onLoad, props.onUnLoad]);

  // Trigger panel "onLoad" operator when panel state changes externally
  useEffect(() => {
    if (
      lastPanelLoadState.current?.count !== panelsStateUpdatesCount &&
      !isEqual(lastPanelLoadState.current?.state, panelState)
    ) {
      executeOperator(props.onLoad, { panel_id: panelId });
    }
    lastPanelLoadState.current = {
      count: panelsStateUpdatesCount,
      state: panelState,
    };
  }, [panelsStateUpdatesCount, panelState, panelId, props.onLoad]);

  useEffect(() => {
    if (props.onViewChange)
      executeOperator(props.onViewChange, {
        panel_id: panelId,
        panel_state: panelState?.state,
      });
  }, [view]);

  useEffect(() => {
    if (props.onChange && panelState?.state)
      executeOperator(props.onChange, {
        panel_id: props.panelId,
        panel_state: panelState.state,
      });
  }, [panelState?.state]);

  const triggerPanelPropertyChange = usePanelEvent();

  const handlePanelStateChange = (newState) => {
    setCustomPanelState((state: any) => {
      return merge({}, state, newState);
    });
  };

  const handlePanelStatePathChange = (path, value, schema) => {
    log("handlePanelStatePathChange", path, value, schema);
    if (schema?.onChange) {
      triggerPanelPropertyChange(panelId, {
        operator: schema.onChange,
        params: { path, value },
      });
    }
  };

  return {
    panelState,
    handlePanelStateChange,
    handlePanelStatePathChange,
    data,
    renderableSchema,
    loaded,
  };
}

function getPanelViewData(panelState) {
  const state = panelState?.state;
  const data = panelState?.data;
  return merge({}, { ...state }, { ...data });
}

function log(message: string, ...data: any[]) {
  console.log(message, ...data);
}
