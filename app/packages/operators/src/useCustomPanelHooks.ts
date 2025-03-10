import { debounce, merge, mergeWith } from "lodash";
import { useCallback, useEffect, useMemo } from "react";

import { usePanelState, useSetCustomPanelState } from "@fiftyone/spaces";
import { DimensionsType, useUnboundState } from "@fiftyone/state";
import {
  PANEL_STATE_CHANGE_DEBOUNCE,
  PANEL_STATE_PATH_CHANGE_DEBOUNCE,
} from "./constants";
import { executeOperator } from "./operators";
import { useCurrentSample, useGlobalExecutionContext } from "./state";
import usePanelEvent from "./usePanelEvent";
import { memoizedDebounce } from "./utils";

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
  onChangeGroupSlice?: string;
  onChangeQueryPerformance?: boolean;
  onChangeSpaces?: string;
  onChangeWorkspace?: string;
  dimensions: DimensionsType | null;
  panelName?: string;
  panelLabel?: string;
  isModalPanel?: boolean;
}

export interface CustomPanelHooks {
  handlePanelStateChange: (state: unknown) => unknown;
  handlePanelStatePathChange: (
    path: string,
    value: unknown,
    schema: unknown,
    state?: unknown
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
  const ctx = useGlobalExecutionContext();
  const currentSample = useCurrentSample();
  const isLoaded: boolean = useMemo(() => {
    return panelStateLocal?.loaded;
  }, [panelStateLocal?.loaded]);
  const triggerPanelEvent = usePanelEvent();
  const lazyState = useUnboundState({ panelState });

  const onLoad = useCallback(() => {
    if (props.onLoad && !isLoaded) {
      executeOperator(
        props.onLoad,
        { panel_id: panelId, panel_state: panelState?.state },
        {
          callback(result) {
            const { error: onLoadError } = result;
            setPanelStateLocal((s) => ({ ...s, onLoadError, loaded: true }));
          },
        }
      );
    }
  }, [props.onLoad, panelId, panelState?.state, isLoaded, setPanelStateLocal]);
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
    currentSample,
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
  useCtxChangePanelEvent(
    isLoaded,
    panelId,
    ctx.groupSlice,
    props.onChangeGroupSlice
  );
  useCtxChangePanelEvent(
    isLoaded,
    panelId,
    ctx.queryPerformance,
    props.onChangeQueryPerformance
  );
  useCtxChangePanelEvent(isLoaded, panelId, ctx.spaces, props.onChangeSpaces);
  useCtxChangePanelEvent(
    isLoaded,
    panelId,
    ctx.workspaceName,
    props.onChangeWorkspace
  );

  useEffect(() => {
    onLoad();
  }, [
    panelId,
    onLoad,
    props.onUnLoad,
    isLoaded,
    setPanelStateLocal,
    triggerPanelEvent,
  ]);

  const handlePanelStateChangeOpDebounced = useMemo(() => {
    return debounce(
      (state, onChange, panelId) => {
        if (onChange && state) {
          triggerPanelEvent(panelId, { operator: onChange });
        }
      },
      PANEL_STATE_CHANGE_DEBOUNCE,
      { leading: true }
    );
  }, [triggerPanelEvent]);

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

  const handlePanelStateChange = (newState) => {
    setCustomPanelState((state: unknown) => {
      return mergeWith({}, state, newState, (objValue, srcValue) => {
        if (Array.isArray(objValue)) {
          return srcValue; // Overwrite instead of merging arrays
        }
      });
    });
  };

  const handlePanelStatePathChange = useMemo(() => {
    return (path, value, schema, state) => {
      if (schema?.onChange) {
        const { panelState } = lazyState;
        const currentPanelState = merge({}, panelState?.state, state);
        triggerPanelEvent(panelId, {
          operator: schema.onChange,
          params: { path, value },
          currentPanelState,
        });
      }
    };
  }, [panelId, triggerPanelEvent, lazyState]);

  const handlePanelStatePathChangeDebounced = useMemo(() => {
    return memoizedDebounce(
      handlePanelStatePathChange,
      PANEL_STATE_PATH_CHANGE_DEBOUNCE
    );
  }, [handlePanelStatePathChange]);

  return {
    loaded: isLoaded,
    handlePanelStateChange,
    handlePanelStatePathChange: handlePanelStatePathChangeDebounced,
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
