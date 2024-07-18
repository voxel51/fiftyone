import { debounce, isEqual, merge } from "lodash";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";

import { usePanelState, useSetCustomPanelState } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { PANEL_STATE_CHANGE_DEBOUNCE } from "./constants";
import { executeOperator } from "./operators";
import {
  panelsStateUpdatesCountAtom,
  useGlobalExecutionContext,
} from "./state";
import usePanelEvent from "./usePanelEvent";

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
    widthRef: React.MutableRefObject<HTMLDivElement | null>;
  } | null;
  panelName?: string;
  panelLabel?: string;
}

export interface CustomPanelHooks {
  handlePanelStateChange: (state: unknown) => unknown;
  handlePanelStatePathChange: (
    path: string,
    value: unknown,
    schema: unknown
  ) => void;
  data: unknown;
  panelSchema: unknown;
  loaded: boolean;
  onLoadError?: string;
}

function useCtxChangePanelEvent(loaded, panelId, value, operator) {
  const triggerCtxChangedEvent = usePanelEvent();
  useEffect(() => {
    if (loaded && operator) {
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
  const view = useRecoilValue(fos.view);
  const panelsStateUpdatesCount = useRecoilValue(panelsStateUpdatesCountAtom);
  const lastPanelLoadState = useRef({
    count: panelsStateUpdatesCount,
    state: panelState,
  });
  const ctx = useGlobalExecutionContext();
  const isLoaded: boolean = useMemo(() => {
    return panelStateLocal?.loaded;
  }, [panelStateLocal?.loaded]);

  const onLoad = useCallback(() => {
    if (props.onLoad) {
      executeOperator(props.onLoad, {
        panel_id: panelId,
        panel_state: panelState?.state,
      });
    }
  }, [props.onLoad, panelId, panelState?.state]);
  useCtxChangePanelEvent(
    isLoaded,
    panelId,
    ctx._currentContext,
    props.onChangeCtx
  );
  useCtxChangePanelEvent(isLoaded, panelId, ctx.view, props.onChangeView);
  useCtxChangePanelEvent(isLoaded, panelId, ctx.viewName, props.onChangeView);
  useCtxChangePanelEvent(isLoaded, panelId, ctx.filters, props.onChangeView);
  useCtxChangePanelEvent(isLoaded, panelId, ctx.extended, props.onChangeView);
  useCtxChangePanelEvent(
    isLoaded,
    panelId,
    ctx.datasetName,
    props.onChangeDataset
  );
  useCtxChangePanelEvent(
    isLoaded,
    panelId,
    ctx.extendedSelection,
    props.onChangeExtendedSelection
  );
  useCtxChangePanelEvent(
    isLoaded,
    panelId,
    ctx.currentSample,
    props.onChangeCurrentSample
  );
  useCtxChangePanelEvent(
    isLoaded,
    panelId,
    ctx.selectedSamples,
    props.onChangeSelected
  );
  useCtxChangePanelEvent(
    isLoaded,
    panelId,
    ctx.selectedLabels,
    props.onChangeSelectedLabels
  );

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

  const handlePanelStateChangeOpDebounced = useMemo(() => {
    return debounce(
      (state, onChange, panelId) => {
        if (onChange && state)
          executeOperator(onChange, { panel_id: panelId, panel_state: state });
      },
      PANEL_STATE_CHANGE_DEBOUNCE,
      { leading: true }
    );
  }, []);

  useEffect(() => {
    if (props.onViewChange)
      executeOperator(props.onViewChange, {
        panel_id: panelId,
        panel_state: panelState?.state,
      });
  }, [view]);

  useEffect(() => {
    handlePanelStateChangeOpDebounced(
      panelState?.state,
      props.onChange,
      panelId
    );
  }, [
    panelState?.state,
    props.onChange,
    panelId,
    handlePanelStateChangeOpDebounced,
  ]);

  const triggerPanelPropertyChange = usePanelEvent();

  const handlePanelStateChange = (newState) => {
    setCustomPanelState((state: any) => {
      return merge({}, state, newState);
    });
  };

  const handlePanelStatePathChange = useCallback(
    (path, value, schema) => {
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
    },
    [triggerPanelPropertyChange, panelId]
  );

  return {
    loaded: isLoaded,
    handlePanelStateChange,
    handlePanelStatePathChange,
    data,
    panelSchema,
    onLoadError: panelStateLocal?.onLoadError,
  };
}

function getPanelViewData(panelState) {
  const state = panelState?.state;
  const data = panelState?.data;
  return merge({}, { ...state }, { ...data });
}
