import { useKeyBindings } from "@fiftyone/commands";
import { KnownContexts, KnownCommands } from "@fiftyone/commands";
import { useRecoilCallback } from "recoil";
import * as fos from "@fiftyone/state";

import { useModalNavigation } from "./useModalNavigation";
import { useModalContext } from "./hooks";

export const useBindModalCommands = (
  modalCloseHandler: () => Promise<void>
) => {
  const { activeLookerRef } = useModalContext();
  const selectCallback = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        const current = await snapshot.getPromise(fos.modalSelector);
        set(fos.selectedSamples, (selected) => {
          const newSelected = new Set([...Array.from(selected)]);
          if (current?.id) {
            if (newSelected.has(current.id)) {
              newSelected.delete(current.id);
            } else {
              newSelected.add(current.id);
            }
          }
          return newSelected;
        });
      },
    []
  );

  const sidebarFn = useRecoilCallback(
    ({ set }) =>
      async () => {
        set(fos.sidebarVisible(true), (prev) => !prev);
      },
    []
  );

  const fullscreenFn = useRecoilCallback(
    ({ set }) =>
      async () => {
        set(fos.fullscreen, (prev) => !prev);
      },
    []
  );

  const modalMode = fos.useModalMode();

  const closeFn = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        const mediaType = await snapshot.getPromise(fos.mediaType);
        const is3dVisible = await snapshot.getPromise(
          fos.groupMediaIs3dVisible
        );

        if (
          modalMode === fos.ModalMode.ANNOTATE ||
          mediaType === "3d" ||
          is3dVisible
        ) {
          return;
        }

        const activeLooker = activeLookerRef.current;
        const activeElement = document.activeElement;
        // @ts-ignore
        const lookerElement = activeLooker?.lookerElement?.element;

        if (
          lookerElement &&
          activeElement &&
          lookerElement.contains(activeElement)
        ) {
          // Looker is focused and should handle the key
          return;
        }

        await modalCloseHandler();
      },
    [modalCloseHandler, modalMode]
  );

  const { next, previous } = useModalNavigation();
  useKeyBindings(KnownContexts.Modal, [
    {
      sequence: "Escape",
      command: {
        commandId: KnownCommands.ModalClose,
        handler: closeFn,
        label: "Close",
        description: "Close the window.",
      },
    },
    {
      sequence: "f",
      command: {
        commandId: KnownCommands.ModalFullScreenToggle,
        handler: fullscreenFn,
        label: "Fullscreen",
        description: "Enter/Exit full screen mode",
      },
    },
    {
      sequence: "s",
      command: {
        commandId: KnownCommands.ModalSidebarToggle,
        handler: sidebarFn,
        label: "Sidebar",
        description: "Show/Hide the sidebar",
      },
    },
    {
      sequence: "x",
      command: {
        commandId: KnownCommands.ModalSelect,
        handler: selectCallback,
        label: "Select",
        description: "Select Sample",
      },
    },
    {
      sequence: "ArrowLeft",
      command: {
        commandId: KnownCommands.ModalPreviousSample,
        handler: previous,
        label: "Previous",
        description: "Previous Sample",
      },
    },
    {
      sequence: "ArrowRight",
      command: {
        commandId: KnownCommands.ModalNextSample,
        handler: next,
        label: "Next",
        description: "Next Sample",
      },
    },
  ]);
};
