import { getContextSelector, pluginsLoaderAtom } from "@fiftyone/plugins";
import debounce from "lodash/debounce";
import isEqual from "lodash/isEqual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { OperatorSurface, RESOLVE_PLACEMENTS_TTL } from "./constants";
import {
  ExecutionContext,
  fetchRemotePlacements,
  listLocalAndRemoteOperators,
  resolveLocalPlacements,
} from "./operators";
import {
  activePanelsEventCountAtom,
  getActiveSurface,
  isOnSurface,
  operatorPlacementsAtom,
  operatorThrottledContext,
  operatorsInitializedAtom,
} from "./state";

function useOperatorThrottledContextSetter() {
  const contextSelector = getContextSelector("operators");
  const context = useRecoilValue(contextSelector);
  const setContext = useSetRecoilState(operatorThrottledContext);

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
    setThrottledContext(context);
  }, [context, setThrottledContext]);
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

export function useFirstExistingUri(uris: string[]) {
  const availableOperators = useMemo(() => listLocalAndRemoteOperators(), []);
  return useMemo(() => {
    const existingUri = uris.find((uri) =>
      availableOperators.allOperators.some((op) => op.uri === uri),
    );
    const exists = Boolean(existingUri);
    return { firstExistingUri: existingUri, exists };
  }, [availableOperators, uris]);
}

export function useExecutableOperatorsURIs(surface?: OperatorSurface) {
  const allOperators = useMemo(() => listLocalAndRemoteOperators(), []);
  const computedSurface = useMemo(
    () => surface ?? getActiveSurface(),
    [surface],
  );
  return useMemo(() => {
    const uris = allOperators.allOperators
      .filter(
        (op) =>
          op.config.canExecute &&
          isOnSurface(op.config.surfaces, computedSurface),
      )
      .map((op) => op.uri);
    return uris;
  }, [allOperators, computedSurface]);
}

export function useCanIExecuteOperators(uris: string[]) {
  const executableUris = useExecutableOperatorsURIs();

  return useMemo(
    () => uris.every((uri) => executableUris.includes(uri)),
    [executableUris, uris],
  );
}
