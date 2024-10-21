import { pluginsLoaderAtom } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { debounce, isEqual } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState, useRecoilState } from "recoil";
import { RESOLVE_PLACEMENTS_TTL } from "./constants";
import {
  ExecutionContext,
  fetchRemotePlacements,
  resolveLocalPlacements,
} from "./operators";
import {
  activePanelsEventCountAtom,
  operatorPlacementsAtom,
  operatorThrottledContext,
  operatorsInitializedAtom,
  useCurrentSample,
} from "./state";

function useOperatorThrottledContextSetter() {
  const datasetName = useRecoilValue(fos.datasetName);
  const view = useRecoilValue(fos.view);
  const viewName = useRecoilValue(fos.viewName);
  const extendedStages = useRecoilValue(fos.extendedStages);
  const filters = useRecoilValue(fos.filters);
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const selectedLabels = useRecoilValue(fos.selectedLabels);
  const groupSlice = useRecoilValue(fos.groupSlice);
  const currentSample = useCurrentSample();
  const setContext = useSetRecoilState(operatorThrottledContext);
  const spaces = useRecoilValue(fos.sessionSpaces);
  const workspaceName = spaces._name;
  const setThrottledContext = useMemo(() => {
    return debounce(
      (context) => {
        setContext(context);
      },
      RESOLVE_PLACEMENTS_TTL,
      { leading: true }
    );
  }, [setContext]);

  useEffect(() => {
    setThrottledContext({
      datasetName,
      view,
      extendedStages,
      filters,
      selectedSamples,
      selectedLabels,
      currentSample,
      viewName,
      groupSlice,
      spaces,
      workspaceName,
    });
  }, [
    setThrottledContext,
    datasetName,
    view,
    extendedStages,
    filters,
    selectedSamples,
    selectedLabels,
    currentSample,
    viewName,
    groupSlice,
    spaces,
    workspaceName,
  ]);
}

export function useOperatorPlacementsResolver() {
  useOperatorThrottledContextSetter();
  const context = useRecoilValue(operatorThrottledContext);
  const operatorsInitialized = useRecoilValue(operatorsInitializedAtom);
  const pluginsLoaderState = useRecoilValue(pluginsLoaderAtom);
  const setOperatorPlacementsAtom = useSetRecoilState(operatorPlacementsAtom);
  const [resolving, setResolving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const lastContext = useRef(null);

  useEffect(() => {
    async function updateOperatorPlacementsAtom() {
      setResolving(true);
      try {
        const ctx = new ExecutionContext({}, context);
        const remotePlacements = await fetchRemotePlacements(ctx);
        const localPlacements = await resolveLocalPlacements(ctx);
        const placements = [...remotePlacements, ...localPlacements];
        setOperatorPlacementsAtom(placements);
      } catch (error) {
        console.error(error);
      }
      setResolving(false);
      setInitialized(true);
    }
    if (
      !isEqual(lastContext.current, context) &&
      context?.datasetName &&
      operatorsInitialized &&
      pluginsLoaderState === "ready"
    ) {
      lastContext.current = context;
      updateOperatorPlacementsAtom();
    }
  }, [
    context,
    setOperatorPlacementsAtom,
    operatorsInitialized,
    pluginsLoaderState,
  ]);

  return { resolving, initialized };
}

export function useActivePanelEventsCount(id: string) {
  const [activePanelEventsCount, setActivePanelEventsCount] = useRecoilState(
    activePanelsEventCountAtom
  );
  const count = useMemo(() => {
    return activePanelEventsCount.get(id) || 0;
  }, [activePanelEventsCount, id]);

  const increment = useCallback(
    (panelId?: string) => {
      const computedId = panelId ?? id;
      setActivePanelEventsCount((counts) => {
        const updatedCount = (counts.get(computedId) || 0) + 1;
        return new Map(counts).set(computedId, updatedCount);
      });
    },
    [id, setActivePanelEventsCount]
  );

  const decrement = useCallback(
    (panelId?: string) => {
      const computedId = panelId ?? id;
      setActivePanelEventsCount((counts) => {
        const updatedCount = (counts.get(computedId) || 0) - 1;
        if (updatedCount < 0) {
          return counts;
        }
        return new Map(counts).set(computedId, updatedCount);
      });
    },
    [id, setActivePanelEventsCount]
  );

  return { count, increment, decrement };
}
