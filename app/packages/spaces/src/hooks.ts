import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { useContext, useMemo } from "react";
import { useRecoilCallback, useRecoilState, useRecoilValue } from "recoil";
import { PanelContext } from "./contexts";
import SpaceNode from "./SpaceNode";
import SpaceTree from "./SpaceTree";
import {
  panelStatePartialSelector,
  panelStateSelector,
  panelTitlesState,
  spaceSelector,
} from "./state";
import { SpaceNodeJSON, SpaceNodeType } from "./types";
import { getNodes } from "./utils";

export function useSpaces(id: string, defaultState?: SpaceNodeJSON) {
  const [state, setState] = useRecoilState(spaceSelector(id));

  if (!state) {
    const baseState = new SpaceNode("root").toJSON();
    setState(defaultState || baseState);
  }

  const spaces = new SpaceTree(state, (spaces: SpaceNodeJSON) => {
    setState(spaces);
  });
  return {
    spaces,
    updateSpaces: (updater: (spaces: SpaceTree) => void) => {
      setState((latestSpaces) => {
        const spaces = new SpaceTree(latestSpaces);
        updater(spaces);
        return spaces.toJSON();
      });
    },
  };
}

export function useSpaceNodes(spaceId: string) {
  const { spaces } = useSpaces(spaceId);

  return useMemo(() => {
    const nodes = getNodes(spaces.root);
    return nodes;
  }, [spaces]);
}

// Hook to use currently available panels
// todo: add can duplicate logic
export function usePanels() {
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const plots = useActivePlugins(PluginComponentType.Plot, { schema });
  const panels = useActivePlugins(PluginComponentType.Panel, { schema });
  return panels.concat(plots);
}

// Hook to use a panel matching id provided
export function usePanel(id: SpaceNodeType) {
  const panels = usePanels();
  return panels.find(({ name }) => name === id);
}

/**
 * Dynamically set the title of a panel from the component of a panel. If `id`
 *  is not provided, `node.id` from panel context will be used
 */
export function usePanelTitle(id?: string) {
  const panelContext = useContext(PanelContext);
  const [panelTitles, setPanelTitles] = useRecoilState(panelTitlesState);

  const panelId = id || panelContext?.node?.id;
  const panelTitle = panelTitles.get(panelId);

  function setPanelTitle(title: string) {
    const updatedPanelTitles = new Map(panelTitles);
    updatedPanelTitles.set(panelId, title);
    setPanelTitles(updatedPanelTitles);
  }
  return [panelTitle, setPanelTitle];
}

export function usePanelContext() {
  return useContext(PanelContext);
}

export function usePanelState(defaultState?: any, id?: string) {
  const panelContext = usePanelContext();
  const panelId = id || (panelContext?.node?.id as string);
  const [state, setState] = useRecoilState(panelStateSelector(panelId));
  const computedState = state || defaultState;

  return [computedState, setState];
}

/**
 * Can only be used within a panel component
 */
export function usePanelStateCallback(callback: (panelState: any) => void) {
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id as string;
  return useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        const panelState = await snapshot.getPromise(
          panelStateSelector(panelId)
        );
        callback(panelState);
      },
    []
  );
}

/**
 * Lazily read panel state on demand
 * @returns a promise which resolves to current state of a panel
 */
export function usePanelStateLazy() {
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id as string;

  const resolvePanelState = useRecoilCallback(
    ({ snapshot }) =>
      async () =>
        snapshot.getPromise(panelStateSelector(panelId))
  );

  return () => resolvePanelState();
}

/**
 * Get partial state of current panel (i.e. property of an object state)
 *
 * Should only be used within a panel component whose state is an object or
 *  an array
 */
export function usePanelStatePartial(key: string, defaultState: any) {
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id as string;
  const [state, setState] = useRecoilState(
    panelStatePartialSelector({ panelId, key })
  );
  const computedState = state || defaultState;

  return [computedState, setState];
}
