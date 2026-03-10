import { PluginComponentRegistration } from "@fiftyone/plugins";
import { SpaceNodeJSON, usePanels } from "@fiftyone/spaces";
import { panelsCompareFn } from "@fiftyone/spaces/src/utils/sort";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MODAL_PLUGINS_REGISRATION_TIMEOUT_MS = 200;

export const SAMPLE_MODAL_PLUGIN_NAME = "fo-sample-modal-plugin";
const SAMPLE_MODAL_PLUGINS_LOCAL_STORAGE_KEY = "fo-sample-modal-plugins";

export const useModalSpaces = () => {
  const [modalSpaces, setModalSpaces] = useState<SpaceNodeJSON | null>(null);

  const panelsPredicate = useCallback(
    (panel: PluginComponentRegistration) =>
      panel.panelOptions?.surfaces === "modal" ||
      panel.panelOptions?.surfaces === "grid modal",
    []
  );

  const allModalPlugins = usePanels(panelsPredicate);

  const defaultModalSpaces = useMemo(() => {
    const sortedPlugins = allModalPlugins.sort(panelsCompareFn);

    return {
      id: "root",
      children: sortedPlugins.map((modalPlugin) => ({
        id: `${modalPlugin.name}`,
        type: modalPlugin.name,
        pinned: modalPlugin.name === SAMPLE_MODAL_PLUGIN_NAME,
        children: [],
      })),
      type: "panel-container",
      activeChild: SAMPLE_MODAL_PLUGIN_NAME,
    } as SpaceNodeJSON;
  }, [allModalPlugins]);

  const defaultModalSpacesRef = useRef<typeof defaultModalSpaces | null>(null);

  defaultModalSpacesRef.current = defaultModalSpaces;

  useEffect(() => {
    let timeOutId = -1;

    const maybeModalSpaces = getModalSpacesFromLocalStorage();
    if (maybeModalSpaces) {
      setModalSpaces(maybeModalSpaces);
    } else {
      // this is a hack to wait for the plugins to be registered
      // we want to show tabs for all modal plugins in the modal
      // this is a one-off thing, since modal spaces config will be persisted aftewards,
      // so we can afford to wait for a bit
      timeOutId = window.setTimeout(() => {
        setModalSpaces(defaultModalSpacesRef.current);
      }, MODAL_PLUGINS_REGISRATION_TIMEOUT_MS);
    }

    return () => {
      window.clearTimeout(timeOutId);
    };
  }, [defaultModalSpaces]);

  return modalSpaces;
};

const getModalSpacesFromLocalStorage = () => {
  const maybeModalSpacesSerialized = localStorage.getItem(
    SAMPLE_MODAL_PLUGINS_LOCAL_STORAGE_KEY
  );
  if (maybeModalSpacesSerialized) {
    return JSON.parse(maybeModalSpacesSerialized);
  }
  return null;
};

export const saveModalSpacesToLocalStorage = (modalSpaces: SpaceNodeJSON) => {
  localStorage.setItem(
    SAMPLE_MODAL_PLUGINS_LOCAL_STORAGE_KEY,
    JSON.stringify(modalSpaces)
  );
};
