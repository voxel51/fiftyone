import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { useContext, useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { PanelContext } from "./contexts";
import SpaceNode from "./SpaceNode";
import SpaceTree from "./SpaceTree";
import { panelsStateAtom, panelTitlesState, spaceSelector } from "./state";
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

export function usePanelState(id?: string) {
  const panelContext = useContext(PanelContext);
  const [panelsState, setPanelsState] = useRecoilState(panelsStateAtom);
  const panelId = id || panelContext?.node?.id;
  const panelState = panelsState.get(panelId) || {};

  function setPanelState(state: any) {
    const updatedPanelsState = new Map(panelsState);
    updatedPanelsState.set(panelId, state);
    setPanelsState(updatedPanelsState);
  }

  return [panelState, setPanelState];
}
