import { SpaceNodeJSON, usePanels } from "@fiftyone/spaces";
import { useCallback, useEffect, useMemo, useState } from "react";

export const SAMPLE_MODAL_PLUGIN_NAME = "fo-sample-modal-plugins";

export const useModalSpaces = () => {
  const [modalSpaces, setModalSpaces] = useState<SpaceNodeJSON | null>(null);

  const panelsPredicate = useCallback(
    (panel) => panel.surfaces === "modal" || panel.surfaces === "grid modal",
    []
  );

  const allModalPlugins = usePanels(panelsPredicate);

  const defaultModalSpaces = useMemo(() => {
    const sortedPlugins = allModalPlugins.sort((a, b) => {
      if (a.name === SAMPLE_MODAL_PLUGIN_NAME) {
        return -1;
      }
      return a.name > b.name ? 1 : 0;
    });

    return {
      id: "root",
      children: sortedPlugins.map((modalPlugin) => ({
        id: `${modalPlugin.name}`,
        type: modalPlugin.name,
        children: [],
        ...modalPlugin.panelOptions,
      })),
      type: "panel-container",
      activeChild: SAMPLE_MODAL_PLUGIN_NAME,
    } as SpaceNodeJSON;
  }, [allModalPlugins]);

  useEffect(() => {
    const maybeModalSpaces = getModalSpacesFromLocalStorage();
    if (maybeModalSpaces) {
      setModalSpaces(maybeModalSpaces);
    } else {
      setModalSpaces(defaultModalSpaces);
    }
  }, [defaultModalSpaces]);

  return modalSpaces;
};

const getModalSpacesFromLocalStorage = () => {
  const maybeModalSpacesSerialized = localStorage.getItem(
    SAMPLE_MODAL_PLUGIN_NAME
  );
  if (maybeModalSpacesSerialized) {
    return JSON.parse(maybeModalSpacesSerialized);
  }
  return null;
};

export const saveModalSpacesToLocalStorage = (modalSpaces: SpaceNodeJSON) => {
  localStorage.setItem(SAMPLE_MODAL_PLUGIN_NAME, JSON.stringify(modalSpaces));
};
