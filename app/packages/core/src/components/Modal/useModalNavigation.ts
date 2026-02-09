import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useUndoRedo } from "@fiftyone/commands";
import { KnownContexts } from "@fiftyone/commands";
import { createDebouncedNavigator } from "./debouncedNavigator";
import useExit from "./Sidebar/Annotate/Edit/useExit";
import useSave from "./Sidebar/Annotate/Edit/useSave";
import { selectiveRenderingEventBus } from "@fiftyone/looker";
import { useLookerHelpers } from "./hooks";

export const useModalNavigation = () => {
  const { closePanels } = useLookerHelpers();
  const clearUndo = useUndoRedo().clear;
  const countLoadable = useRecoilValueLoadable(
    fos.count({ path: "", extended: true, modal: false })
  );
  const count = useRef<number | null>(null);
  if (countLoadable.state === "hasValue") {
    count.current = countLoadable.contents;
  }

  const setModal = fos.useSetExpandedSample();
  const modal = useRecoilValue(fos.modalSelector);

  const modalRef = useRef(modal);

  modalRef.current = modal;

  // important: make sure all dependencies of the navigators are referentially stable,
  // or else the debouncing mechanism won't work
  const nextNavigator = useMemo(
    () =>
      createDebouncedNavigator({
        isNavigationIllegalWhen: () => modalRef.current?.hasNext === false,
        navigateFn: async (offset) => {
          const navigation = fos.modalNavigation.get();
          if (navigation) {
            clearUndo();
            return await navigation.next(offset).then((s) => {
              selectiveRenderingEventBus.removeAllListeners();
              setModal(s);
            });
          }
        },
        onNavigationStart: closePanels,
        debounceTime: 150,
      }),
    [closePanels, setModal, clearUndo]
  );

  const previousNavigator = useMemo(
    () =>
      createDebouncedNavigator({
        isNavigationIllegalWhen: () => modalRef.current?.hasPrevious === false,
        navigateFn: async (offset) => {
          const navigation = fos.modalNavigation.get();
          if (navigation) {
            clearUndo();
            return await navigation.previous(offset).then((s) => {
              selectiveRenderingEventBus.removeAllListeners();
              setModal(s);
            });
          }
        },
        onNavigationStart: closePanels,
        debounceTime: 150,
      }),
    [closePanels, setModal, clearUndo]
  );

  useEffect(() => {
    return () => {
      nextNavigator.cleanup();
      previousNavigator.cleanup();
    };
  }, [nextNavigator, previousNavigator]);
  const onExit = useExit();
  const onSave = useSave();
  const next = useCallback(async () => {
    onSave();
    onExit();
    nextNavigator.navigate();
  }, [nextNavigator, onExit, onSave]);

  const previous = useCallback(async () => {
    onSave();
    onExit();
    previousNavigator.navigate();
  }, [previousNavigator, onSave, onExit]);

  return { next, previous };
};
