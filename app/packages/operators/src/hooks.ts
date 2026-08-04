import { getContextSelector, pluginsLoaderAtom } from "@fiftyone/plugins";
import debounce from "lodash/debounce";
import isEqual from "lodash/isEqual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { OperatorScope, RESOLVE_PLACEMENTS_TTL } from "./constants";
import {
  ExecutionContext,
  fetchRemotePlacements,
  listLocalAndRemoteOperators,
  type RawContext,
  resolveLocalPlacements,
} from "./operators";
import {
  activePanelsEventCountAtom,
  activeScopeAtom,
  getActiveScope,
  isInScope,
  operatorPlacementsAtom,
  operatorThrottledContext,
  operatorsInitializedAtom,
} from "./state";

async function resolvePlacements(context: RawContext) {
  const ctx = new ExecutionContext({}, context);
  const [remotePlacements, localPlacements] = await Promise.all([
    fetchRemotePlacements(ctx),
    resolveLocalPlacements(ctx),
  ]);

  return [...remotePlacements, ...localPlacements];
}

type ResolvedPlacements = Awaited<ReturnType<typeof resolvePlacements>>;

let latestPlacementResolution:
  | {
      context: RawContext;
      expiresAt: number;
      promise: Promise<ResolvedPlacements>;
    }
  | undefined;

function resolvePlacementsOnce(context: RawContext) {
  const now = Date.now();
  if (
    latestPlacementResolution &&
    latestPlacementResolution.expiresAt > now &&
    isEqual(latestPlacementResolution.context, context)
  ) {
    return latestPlacementResolution.promise;
  }

  const promise = resolvePlacements(context);
  latestPlacementResolution = {
    context,
    expiresAt: now + RESOLVE_PLACEMENTS_TTL,
    promise,
  };
  promise.catch(() => {
    if (latestPlacementResolution?.promise === promise) {
      latestPlacementResolution = undefined;
    }
  });

  return promise;
}

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

  useEffect(() => {
    return () => {
      setThrottledContext.cancel();
    };
  }, [setThrottledContext]);

  return context;
}

export function useOperatorPlacementsResolver() {
  const sourceContext = useOperatorThrottledContextSetter();
  const context = useRecoilValue(operatorThrottledContext);
  const activeScope = useRecoilValue(activeScopeAtom);
  const operatorsInitialized = useRecoilValue(operatorsInitializedAtom);
  const pluginsLoaderState = useRecoilValue(pluginsLoaderAtom);
  const setOperatorPlacementsAtom = useSetRecoilState(operatorPlacementsAtom);
  const [resolving, setResolving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const lastContext = useRef(null);
  const resolution = useRef(0);

  useEffect(() => {
    async function updateOperatorPlacementsAtom() {
      const request = ++resolution.current;
      setResolving(true);
      try {
        const placementContext = {
          ...context,
          activeScope,
        } as RawContext;
        const placements = await resolvePlacementsOnce(placementContext);
        if (request !== resolution.current) return;
        setOperatorPlacementsAtom(placements);
      } catch (error) {
        if (request !== resolution.current) return;
        console.error(error);
      }
      if (request !== resolution.current) return;
      setResolving(false);
      setInitialized(true);
    }
    const placementContext = {
      ...context,
      activeScope,
    } as RawContext;
    if (
      isEqual(sourceContext, context) &&
      !isEqual(lastContext.current, placementContext) &&
      operatorsInitialized &&
      pluginsLoaderState === "ready"
    ) {
      lastContext.current = placementContext;
      updateOperatorPlacementsAtom();
    }
  }, [
    context,
    sourceContext,
    activeScope,
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

export function useExecutableOperatorsURIs(scope?: OperatorScope) {
  const allOperators = useMemo(() => listLocalAndRemoteOperators(), []);
  const computedScope = useMemo(() => scope ?? getActiveScope(), [scope]);
  return useMemo(() => {
    const uris = allOperators.allOperators
      .filter(
        (op) =>
          op.config.canExecute && isInScope(op.config.scopes, computedScope),
      )
      .map((op) => op.uri);
    return uris;
  }, [allOperators, computedScope]);
}

export function useCanIExecuteOperators(uris: string[]) {
  const executableUris = useExecutableOperatorsURIs();

  return useMemo(
    () => uris.every((uri) => executableUris.includes(uri)),
    [executableUris, uris],
  );
}
