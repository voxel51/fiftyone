import { pluginsLoaderAtom } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { debounce, isEqual } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useRecoilValue,
  useRecoilValueLoadable,
  useSetRecoilState,
} from "recoil";
import { RESOLVE_PLACEMENTS_TTL } from "./constants";
import {
  ExecutionContext,
  fetchRemotePlacements,
  resolveLocalPlacements,
} from "./operators";
import {
  operatorPlacementsAtom,
  operatorThrottledContext,
  operatorsInitializedAtom,
} from "./state";

function useCurrentSample() {
  // 'currentSampleId' may suspend for group datasets, so we use a loadable
  const currentSample = useRecoilValueLoadable(fos.currentSampleId);
  return currentSample.state === "hasValue" ? currentSample.contents : null;
}

function useOperatorThrottledContextSetter() {
  const datasetName = useRecoilValue(fos.datasetName);
  const view = useRecoilValue(fos.view);
  const extendedStages = useRecoilValue(fos.extendedStages);
  const filters = useRecoilValue(fos.filters);
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const selectedLabels = useRecoilValue(fos.selectedLabels);
  const currentSample = useCurrentSample();
  const setContext = useSetRecoilState(operatorThrottledContext);
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
