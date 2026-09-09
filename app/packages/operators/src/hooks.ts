import { pluginsLoaderAtom } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { debounce, isEqual } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState, useRecoilState } from "recoil";
import { RESOLVE_PLACEMENTS_TTL } from "./constants";
import {
  ExecutionContext,
  fetchRemotePlacements,
  resolveOperatorURI,
  resolveLocalPlacements,
  type RawContext,
} from "./operators";
import {
  activePanelsEventCountAtom,
  availableOperators,
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
  const sampleSelectionStyle = useRecoilValue(fos.sampleSelectionStyle);
  const selectedLabels = useRecoilValue(fos.selectedLabels);
  const groupSlice = useRecoilValue(fos.groupSlice);
  const currentSample = useCurrentSample();
  const setContext = useSetRecoilState(operatorThrottledContext);
  const spaces = useRecoilValue(fos.sessionSpaces);
  const workspaceName = spaces._name;
  const modal = !!useRecoilValue(fos.modal);
  const extendedSelection = useRecoilValue(fos.extendedSelection);
  const activeFields = useRecoilValue(fos.activeFields({ modal }));
  const setThrottledContext = useMemo(() => {
    return debounce(
      (context) => {
        setContext(context);
      },
      RESOLVE_PLACEMENTS_TTL,
      { leading: true },
    );
  }, [setContext]);

  useEffect(() => {
    setThrottledContext({
      datasetName,
      view,
      extended: extendedStages,
      filters,
      selectedSamples,
      sampleSelectionStyle,
      selectedLabels,
      currentSample,
      viewName,
      groupSlice,
      spaces,
      workspaceName,
      extendedSelection,
      activeFields,
    });
  }, [
    setThrottledContext,
    datasetName,
    view,
    extendedStages,
    filters,
    selectedSamples,
    sampleSelectionStyle,
    selectedLabels,
    currentSample,
    viewName,
    groupSlice,
    spaces,
    workspaceName,
    extendedSelection,
    activeFields,
  ]);
}

function isCompleteThrottledContext(
  context: Partial<RawContext>,
): context is RawContext {
  return Boolean(context.datasetName);
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
    async function updateOperatorPlacementsAtom(completeContext: RawContext) {
      setResolving(true);
      try {
        // this context only has the fields the setter above publishes, not
        // everything a live invocation context would — that's enough for
        // resolving placements
        const ctx = new ExecutionContext({}, completeContext);
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
      isCompleteThrottledContext(context) &&
      operatorsInitialized &&
      pluginsLoaderState === "ready"
    ) {
      lastContext.current = context;
      updateOperatorPlacementsAtom(context);
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
    activePanelsEventCountAtom,
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
    [id, setActivePanelEventsCount],
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
    [id, setActivePanelEventsCount],
  );

  return { count, increment, decrement };
}

/** Reactively returns the first registered operator URI from a list. */
export function useFirstExistingUri(uris: string[]) {
  const operators = useRecoilValue(availableOperators);
  const existingUri = uris.find((uri) => {
    const resolvedUri = resolveOperatorURI(uri);
    return operators.some((operator) => operator.value === resolvedUri);
  });
  return { firstExistingUri: existingUri, exists: Boolean(existingUri) };
}

/**
 * Reactively reports whether an operator URI is registered. This checks
 * registry presence only; callers remain responsible for permission checks.
 */
export function useOperatorAvailability(uri: string) {
  return useFirstExistingUri([uri]).exists;
}
