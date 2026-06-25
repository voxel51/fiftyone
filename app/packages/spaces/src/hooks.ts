import {
  type PanelRegistration,
  PluginComponentType,
  type PlotRegistration,
  subscribeToRegistry,
  useActivePlugins,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { SortableEvent } from "react-sortablejs";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import SpaceTree from "./SpaceTree";
import { PanelContext } from "./contexts";
import {
  currentPanelAreasRenderer,
  panelAreaRenderers,
  panelIdToScopeAtom,
  panelLoadingSelector,
  panelStatePartialSelector,
  panelStateSelector,
  panelTitlesState,
  panelsCloseEffect,
  panelsLoadingStateAtom,
  panelsLocalStateAtom,
  panelsStateAtom,
  previousTabsGroupAtom,
  spaceSelector,
} from "./state";
import {
  PanelsCloseEffect,
  PanelsStateObject,
  SpaceNodeJSON,
  SpaceNodeType,
} from "./types";
import { getNodes } from "./utils";
import { isNullish } from "@fiftyone/utilities";

type SpacePanelRegistration = PanelRegistration | PlotRegistration;

export function useSpaces(id: string, defaultState?: SpaceNodeJSON) {
  const [state, setState] = useRecoilState(spaceSelector(id));

  useEffect(() => {
    if (!state && defaultState) {
      setState(defaultState);
    }
  }, [state, setState, defaultState]);

  const spaces = useMemo(
    () =>
      new SpaceTree(state, (spaces: SpaceNodeJSON) => {
        setState(spaces);
      }),
    [state]
  );

  const clearSpaces = useCallback(() => {
    setState(undefined);
  }, [setState]);

  const updateSpaces = useCallback(
    (
      serializedTreeOrUpdater: ((spaces: SpaceTree) => void) | SpaceNodeJSON
    ) => {
      if (typeof serializedTreeOrUpdater === "function") {
        setState((latestSpaces) => {
          const spaces = new SpaceTree(latestSpaces);
          serializedTreeOrUpdater(spaces);
          return spaces.toJSON();
        });
      } else {
        setState(serializedTreeOrUpdater);
      }
    },
    []
  );

  return {
    spaces,
    clearSpaces,
    updateSpaces,
  };
}

/**
 * Get and set multiple panels session or local state
 */
export function usePanelsState(
  local?: boolean
): [PanelsStateObject, (newPanelsState: PanelsStateObject) => void] {
  const [panelsState, setPanelsState] = useRecoilState(
    local ? panelsLocalStateAtom : panelsStateAtom
  );

  const state = Object.fromEntries(panelsState);
  function setState(newPanelsState: PanelsStateObject) {
    setPanelsState(new Map(Object.entries(newPanelsState)));
  }

  return [state, setState];
}

export function useSpaceNodes(spaceId: string) {
  const { spaces } = useSpaces(spaceId);

  return useMemo(() => {
    const nodes = getNodes(spaces.root);
    return nodes;
  }, [spaces]);
}

/**
 * Hook to get all panels registered in the app, optionally filtered by a
 * predicate.
 *
 * @param predicate - A function that takes a panel and returns `true` if
 * the panel should be included in the result. It is important for the predicate
 * to be memoized using `useCallback` to avoid unnecessary re-renders.
 */
export function usePanels(
  predicate?: (panel: SpacePanelRegistration) => boolean
) {
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const dataset = useRecoilValue(fos.dataset);
  const ctx = useMemo(() => ({ schema, dataset }), [schema, dataset]);
  const plots = useActivePlugins(PluginComponentType.Plot, ctx);
  const panels = useActivePlugins(PluginComponentType.Panel, ctx);

  const panelsToReturn = useMemo(() => {
    const allPanels = [...plots, ...panels];
    if (predicate) {
      return allPanels.filter(predicate);
    }
    return allPanels;
  }, [plots, panels, predicate]) as SpacePanelRegistration[];

  return panelsToReturn;
}

export function usePanel(
  name: SpaceNodeType,
  predicate?: (panel: SpacePanelRegistration) => boolean
) {
  const combinedPredicate = useMemo(() => {
    if (predicate) {
      return (panel: SpacePanelRegistration) =>
        panel.name === name && predicate(panel);
    }
    return (panel: SpacePanelRegistration) => panel.name === name;
  }, [predicate]);
  const panels = usePanels(combinedPredicate);
  return panels.at(0);
}

export function useReactivePanel(name: SpaceNodeType) {
  const [_, setCount] = useState(0);
  useEffect(() => {
    return subscribeToRegistry(() => {
      setCount((count) => count + 1); // trigger re-resolution of panels
    });
  }, []);
  const predicate = useCallback(
    (panel: SpacePanelRegistration) => {
      return panel.name === name;
    },
    [name]
  );
  const panels = usePanels(predicate);

  return panels.at(0);
}

/**
 * Get and set title of a panel
 *
 * Note: `id` is optional if hook is used within the component of a panel.
 */
export function usePanelTitle(id?: string) {
  const panelContext = useContext(PanelContext);
  const [panelTitles, setPanelTitles] = useRecoilState(panelTitlesState);

  const panelId = id || panelContext?.node?.id;
  const panelTitle = panelTitles.get(panelId);

  const setPanelTitle = useCallback(
    (title: string, id?: string) => {
      const updatedPanelTitles = new Map(panelTitles);
      updatedPanelTitles.set(id || panelId, title);
      setPanelTitles(updatedPanelTitles);
    },
    [panelTitles, panelId]
  );

  const resetPanelTitle = useCallback(() => {
    const updatedPanelTitles = new Map(panelTitles);
    updatedPanelTitles.delete(id || panelId);
    setPanelTitles(updatedPanelTitles);
  }, [panelTitles, panelId]);

  return [panelTitle, setPanelTitle, resetPanelTitle] as const;
}

/**
 * Get and set loading state of a panel
 *
 * Note: `id` is optional if hook is used within the component of a panel.
 */
export function usePanelLoading(
  id?: string
): [boolean, (loading: boolean, id?: string) => void] {
  const panelContext = useContext(PanelContext);
  const panelId = (id || panelContext?.node?.id) as string;

  // Subscribe only to this panel's loading state so flips on other panels
  // don't re-render this consumer.
  const panelLoading = useRecoilValue(panelLoadingSelector(panelId));
  const setPanelsLoadingState = useSetRecoilState(panelsLoadingStateAtom);

  const setPanelLoading = useCallback(
    (loading: boolean, targetId?: string) => {
      setPanelsLoadingState((panelsLoading) => {
        const finalId = targetId || panelId;
        // Dedupe: returning the same reference skips the Recoil write and
        // avoids re-rendering every subscriber when the value is unchanged.
        if (panelsLoading.get(finalId) === loading) return panelsLoading;
        // Also skip writing `false` for a key that doesn't exist yet — a
        // missing entry already reads as false
        if (!loading && !panelsLoading.has(finalId)) return panelsLoading;
        const updatedPanelsLoading = new Map(panelsLoading);
        updatedPanelsLoading.set(finalId, loading);
        return updatedPanelsLoading;
      });
    },
    [panelId, setPanelsLoadingState]
  );

  return [panelLoading, setPanelLoading];
}

export function usePanelContext() {
  return useContext(PanelContext);
}

/**
 * Get and set state of a panel
 *
 * Note: `id` is optional if hook is used within the component of a panel.
 */
export function usePanelState<T>(
  defaultState?: T,
  id?: string,
  local?: boolean,
  scope?: string
) {
  const panelScope = useScope(scope);
  const panelContext = usePanelContext();
  const panelId = id || (panelContext?.node?.id as string);
  const [state, setState] = useRecoilState<T>(
    panelStateSelector({ panelId, local, scope: panelScope })
  );
  const computedState = state || defaultState;

  return [computedState, setState] as [typeof computedState, typeof setState];
}

export function useSetPanelStateById(local?: boolean, scope?: string) {
  const panelScope = useScope(scope);
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (panelId: string, fn: (state: any) => any) => {
        const panelIdToScope = await snapshot.getPromise(panelIdToScopeAtom);
        const computedScope = panelScope || panelIdToScope?.[panelId];
        const panelState = await snapshot.getPromise(
          panelStateSelector({ panelId, local, scope: computedScope })
        );
        const updatedValue = fn(panelState);
        set(
          panelStateSelector({ panelId, local, scope: computedScope }),
          updatedValue
        );
      },
    []
  );
}

export function usePanelId() {
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id as string;
  return panelId;
}

export function useSetCustomPanelState<T>(local?: boolean) {
  const [, setPanelState] = usePanelState<{ state: T }>(null, undefined, local);
  return (fn: (state: T) => T) => {
    setPanelState((panelState) => {
      const state = fn((panelState?.state ?? {}) as T);
      return { ...panelState, state };
    });
  };
}

/**
 * Can only be used within a panel component
 */
export function usePanelStateCallback<T>(
  callback: (panelState: T) => void,
  local?: boolean,
  scope?: string
) {
  const panelScope = useScope(scope);
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id as string;
  return useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        const panelState = await snapshot.getPromise(
          panelStateSelector({ panelId, local, scope: panelScope })
        );
        callback(panelState);
      },
    []
  );
}

/**
 * Get a callback function that can be used to update the panel state.
 *
 * @param callback - A function that takes a panelId, panelState, and args.
 * @param local - Whether the panel state is local to the panel.
 * @param scope - The scope of the panel.
 * @returns A callback function that can be used to update the panel state. The
 * callback is called with the panelId, panelState, and args.
 *
 * Example:
 * ```ts
 * const resolvePanelState = (panelId, panelState, args) => {
 *   const [countInc] = args;
 *   // do something with the panelState
 *   const count = panelState.count + countInc;
 *   return { ...panelState, count };
 * };
 * const local = true; // true = local state, false = global state
 * const setPanelState = usePanelStateByIdCallback(resolvePanelState, local, scope);
 * const usePanelId = usePanelId();
 * const countInc = 10;
 * setPanelState("panelId", panelState, [countInc]);
 * ```
 */
export function usePanelStateByIdCallback<T>(
  callback: (panelId: string, panelState: T, args: any[]) => void,
  local?: boolean,
  scope?: string
) {
  const panelScope = useScope(scope);
  return useRecoilCallback(
    ({ snapshot }) =>
      async (panelId: string, ...args) => {
        const panelState = await snapshot.getPromise(
          panelStateSelector({ panelId, local, scope: panelScope })
        );
        callback(panelId, panelState, args as any[]);
      },
    []
  );
}

/**
 * Lazily read panel state on demand
 * @returns a state resolver function which return promise that resolves to the
 * current state of a panel
 */
export function usePanelStateLazy(local?: boolean, scope?: string) {
  const panelScope = useScope(scope);
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id as string;

  const resolvePanelState = useRecoilCallback(
    ({ snapshot }) =>
      async () =>
        snapshot.getPromise(
          panelStateSelector({ panelId, local, scope: panelScope })
        )
  );

  return () => resolvePanelState();
}

/**
 * Get partial state of current panel (i.e. property of an object state)
 *
 * Should only be used within a panel component whose state is an object or
 *  an array
 */
export function usePanelStatePartial<T>(
  key: string,
  defaultState: T,
  local?: boolean,
  scope?: string
) {
  const panelScope = useScope(scope);
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id as string;
  const [state, setState] = useRecoilState<T>(
    panelStatePartialSelector({ panelId, key, local, scope: panelScope })
  );
  const computedState = useComputedState(state, defaultState);
  return [computedState, setState];
}

function useComputedState(state: any, defaultState: any) {
  const defaultRef = useRef(defaultState);
  return state === undefined ? defaultRef.current : state;
}

export function usePanelTabAutoPosition() {
  const setPreviousTabGroup = useSetRecoilState(previousTabsGroupAtom);
  const getPreviousTabGroup = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        return snapshot.getPromise(previousTabsGroupAtom);
      },
    []
  );

  function autoPositionElement(group: HTMLElement, item?: HTMLElement) {
    const lastChild = group.lastChild as HTMLElement;

    if (!lastChild) return;

    const secondLastChild = lastChild.previousSibling as HTMLElement;
    const lastChildIsIgnored = lastChild.classList.contains("sortable-ignore");

    if (!lastChildIsIgnored && secondLastChild) {
      lastChild.style.transform = `translate(-${secondLastChild.offsetWidth}px)`;
      secondLastChild.style.transform = `translate(${lastChild.offsetWidth}px)`;
    } else if (lastChildIsIgnored) {
      lastChild.style.transform = "none";
      if (secondLastChild) secondLastChild.style.transform = "none";
      if (item) item.style.transform = "none";
    }
  }

  async function autoPosition(e: SortableEvent) {
    const previousTabGroup = await getPreviousTabGroup();
    if (previousTabGroup && e.to != previousTabGroup) {
      autoPositionElement(previousTabGroup);
      setPreviousTabGroup(null);
    }
    const { from, to, item } = e;
    if (from != to) {
      autoPositionElement(from, item);
      autoPositionElement(to, item);
      setPreviousTabGroup(to);
    } else {
      autoPositionElement(to, item);
    }
  }

  return autoPosition;
}

export function useSetPanelCloseEffect(panelId?: string) {
  const panelContext = usePanelContext();
  const computedPanelId = panelId || (panelContext?.node?.id as string);

  return (effect: PanelsCloseEffect[string]) => {
    panelsCloseEffect[computedPanelId] = effect;
  };
}

export function usePanelCloseEffect(panelId?: string) {
  const panelContext = usePanelContext();
  const computedPanelId = panelId || (panelContext?.node?.id as string);

  return () => {
    const panelCloseEffect = panelsCloseEffect[computedPanelId];
    if (panelCloseEffect) {
      delete panelsCloseEffect[computedPanelId];
      panelCloseEffect();
    }
  };
}

function useScope(scope?: string) {
  const panelContext = usePanelContext();
  if (typeof scope === "string") return scope;
  return panelContext?.scope;
}

export function usePanelAreaRenderer(areaId: string) {
  const [currentRenderers, setCurrentRenderers] = useRecoilState(
    currentPanelAreasRenderer
  );

  const renderers = useSyncExternalStore(
    panelAreaRenderers.subscribe,
    panelAreaRenderers.getSnapshot
  );

  const setRenderer = useCallback(
    (rendererId: string) => {
      setCurrentRenderers((renderers) => {
        const updatedRenderers = new Map(renderers);
        updatedRenderers.set(areaId, rendererId);
        return updatedRenderers;
      });
    },
    [areaId, setCurrentRenderers]
  );

  const unsetRenderer = useCallback(
    (rendererId: string) => {
      setCurrentRenderers((renderers) => {
        const updatedRenderers = new Map(renderers);
        if (!rendererId || updatedRenderers.get(areaId) === rendererId) {
          updatedRenderers.delete(areaId);
        }
        return updatedRenderers;
      });
    },
    [areaId, setCurrentRenderers]
  );

  const currentRendererId = currentRenderers.get(areaId);
  const CurrentRenderer = currentRendererId
    ? renderers.get(currentRendererId)
    : undefined;

  return { setRenderer, unsetRenderer, currentRendererId, CurrentRenderer };
}

export function useInitializePanel() {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (
        panelId: string,
        scope?: string,
        state?: Record<string, unknown>,
        data?: Record<string, unknown>
      ) => {
        const currentIdToScope = await snapshot.getPromise(panelIdToScopeAtom);
        if (!isNullish(scope)) {
          set(panelIdToScopeAtom, { ...currentIdToScope, [panelId]: scope });
        }
        if (state) {
          set(panelStateSelector({ panelId, local: false, scope }), state);
        }
        if (data) {
          set(panelStateSelector({ panelId, local: true, scope }), data);
        }
      }
  );
}
