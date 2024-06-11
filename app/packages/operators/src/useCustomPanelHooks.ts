import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { merge, isEqual } from "lodash";

import { usePanelState, useSetCustomPanelState } from "@fiftyone/spaces";
import { executeOperator } from "./operators";
import * as fos from "@fiftyone/state";
import usePanelEvent from "./usePanelEvent";
import {
  panelsStateUpdatesCountAtom,
  useGlobalExecutionContext,
} from "./state";

export interface CustomPanelProps {
  panelId: string;
  onLoad?: string;
  onChange?: string;
  onUnLoad?: string;
  onChangeCtx?: string;
  onViewChange?: string;
  onChangeView?: string;
  onChangeDataset?: string;
  onChangeCurrentSample?: string;
  onChangeSelected?: string;
  onChangeSelectedLabels?: string;
  onChangeExtendedSelection?: string;
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
  panelSchema: any;
  loaded: boolean;
}

function useCtxChangePanelEvent(panelId, value, operator) {
  const triggerCtxChangedEvent = usePanelEvent();
  useEffect(() => {
    if (operator) {
      triggerCtxChangedEvent(panelId, { operator, params: { value } });
    }
  }, [value, operator]);
}

export function useCustomPanelHooks(props: CustomPanelProps): CustomPanelHooks {
  const { panelId } = props;
  const [panelState] = usePanelState(null, panelId);
  const [panelStateLocal, setPanelStateLocal] = usePanelState(
    null,
    panelId,
    true
  );
  const setCustomPanelState = useSetCustomPanelState();
  const data = getPanelViewData({
    state: panelState?.state,
    data: panelStateLocal?.data,
  });
  const panelSchema = panelStateLocal?.schema;
  const [loaded] = useState(false);
  const view = useRecoilValue(fos.view);
  const panelsStateUpdatesCount = useRecoilValue(panelsStateUpdatesCountAtom);
  const lastPanelLoadState = useRef({
    count: panelsStateUpdatesCount,
    state: panelState,
  });
  const ctx = useGlobalExecutionContext();

  const onLoad = useCallback(() => {
    if (props.onLoad) {
      executeOperator(props.onLoad, {
        panel_id: panelId,
        panel_state: panelState?.state,
      });
    }
  }, [props.onLoad, panelId, panelState?.state]);
  useCtxChangePanelEvent(panelId, ctx._currentContext, props.onChangeCtx);
  useCtxChangePanelEvent(panelId, ctx.view, props.onChangeView);
  useCtxChangePanelEvent(panelId, ctx.viewName, props.onChangeView);
  useCtxChangePanelEvent(panelId, ctx.filters, props.onChangeView);
  useCtxChangePanelEvent(panelId, ctx.extended, props.onChangeView);
  useCtxChangePanelEvent(panelId, ctx.datasetName, props.onChangeDataset);
  useCtxChangePanelEvent(
    panelId,
    ctx.extendedSelection,
    props.onChangeExtendedSelection
  );
  useCtxChangePanelEvent(
    panelId,
    ctx.currentSample,
    props.onChangeCurrentSample
  );
  useCtxChangePanelEvent(panelId, ctx.selectedSamples, props.onChangeSelected);
  useCtxChangePanelEvent(
    panelId,
    ctx.selectedLabels,
    props.onChangeSelectedLabels
  );
  const isLoaded = useMemo(() => {
    return panelStateLocal?.loaded;
  }, [panelStateLocal?.loaded]);

  useEffect(() => {
    if (props.onLoad && !isLoaded) {
      executeOperator(
        props.onLoad,
        { panel_id: panelId },
        {
          callback(result) {
            const { error: onLoadError } = result;
            setPanelStateLocal((s) => ({ ...s, onLoadError, loaded: true }));
          },
        }
      );
    }

    return () => {
      if (props.onUnLoad)
        executeOperator(props.onUnLoad, { panel_id: panelId });
    };
  }, [panelId, props.onLoad, props.onUnLoad, isLoaded, setPanelStateLocal]);

  // Trigger panel "onLoad" operator when panel state changes externally
  useEffect(() => {
    if (
      lastPanelLoadState.current?.count !== panelsStateUpdatesCount &&
      !isEqual(lastPanelLoadState.current?.state, panelState)
    ) {
      setPanelStateLocal({});
      onLoad();
    }
    lastPanelLoadState.current = {
      count: panelsStateUpdatesCount,
      state: panelState,
    };
  }, [
    panelsStateUpdatesCount,
    panelState,
    panelId,
    onLoad,
    setPanelStateLocal,
  ]);

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
    if (schema?.onChange) {
      // This timeout allows the change to be applied before executing the operator
      // it might make sense to do this for all operator executions
      setTimeout(() => {
        triggerPanelPropertyChange(panelId, {
          operator: schema.onChange,
          params: { path, value },
        });
      }, 0);
    }
  };

  return {
    panelState,
    handlePanelStateChange,
    handlePanelStatePathChange,
    data,
    panelSchema,
    loaded,
  };
}

function getPanelViewData(panelState) {
  const state = panelState?.state;
  const data = panelState?.data;
  return merge({}, { ...state }, { ...data });
}
