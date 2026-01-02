/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import {
  CollapseFieldInGridCommand,
  CollapseFieldInModalCommand,
  ExpandAndScrollToFieldInGridCommand,
  ExpandAndScrollToFieldInModalCommand,
  ExpandFieldInGridCommand,
  ExpandFieldInModalCommand,
  ScrollToFieldInGridCommand,
  ScrollToFieldInModalCommand,
} from "../../../commands";
import { InteractiveItems } from "./types";
import { getEntryKey } from "./utils";

/**
 * Hook that registers command handlers for sidebar field operations.
 * This should be called in InteractiveSidebar.
 *
 * @param container - Ref to the sidebar container element
 * @param entries - Current sidebar entries
 * @param items - Ref to interactive items
 * @param modal - Whether this is the modal sidebar (true) or grid sidebar (false)
 */
export const useRegisterSidebarCommandHandlers = (
  container: React.RefObject<HTMLDivElement | null>,
  entries: fos.SidebarEntry[],
  items: React.MutableRefObject<InteractiveItems>,
  modal: boolean
) => {
  const handleExpandField = useRecoilCallback(
    ({ set }) =>
      async (path: string) => {
        set(fos.sidebarExpanded({ path, modal }), true);
      },
    [modal]
  );

  useRegisterCommandHandler(
    modal ? ExpandFieldInModalCommand : ExpandFieldInGridCommand,
    useCallback(
      async (cmd) => {
        await handleExpandField(cmd.path);
      },
      [handleExpandField]
    )
  );

  const handleCollapseField = useRecoilCallback(
    ({ set }) =>
      async (path: string) => {
        set(fos.sidebarExpanded({ path, modal }), false);
      },
    [modal]
  );

  const handleCollapseFieldWithExpandedPath = useRecoilCallback(
    ({ snapshot }) =>
      async (path: string) => {
        // Get the full expanded path (e.g., "yolo11.detections")
        const expandedPath = await snapshot.getPromise(fos.expandPath(path));
        await handleCollapseField(expandedPath);
      },
    [handleCollapseField]
  );

  useRegisterCommandHandler(
    modal ? CollapseFieldInModalCommand : CollapseFieldInGridCommand,
    useCallback(
      async (cmd) => {
        await handleCollapseFieldWithExpandedPath(cmd.path);
      },
      [handleCollapseFieldWithExpandedPath]
    )
  );

  // Handler: Scroll to field
  const handleScrollToField = useCallback(
    async (path: string) => {
      if (!container.current) {
        return;
      }

      // Find the target entry
      const targetEntry = entries.find(
        (entry) => entry.kind === fos.EntryKind.PATH && entry.path === path
      );

      if (!targetEntry) {
        return;
      }

      const targetKey = getEntryKey(targetEntry);
      const targetItem = items.current[targetKey];

      if (!targetItem?.el) {
        return;
      }

      // Scroll the element into view
      targetItem.el.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    },
    [container, entries, items]
  );

  useRegisterCommandHandler(
    modal ? ScrollToFieldInModalCommand : ScrollToFieldInGridCommand,
    useCallback(
      async (cmd) => {
        await handleScrollToField(cmd.path);
      },
      [handleScrollToField]
    )
  );

  // Handler: Expand and scroll to field
  const handleExpandAndScrollToField = useRecoilCallback(
    ({ snapshot }) =>
      async (path: string) => {
        // Get the full expanded path (e.g., "yolo11.detections")
        const expandedPath = await snapshot.getPromise(fos.expandPath(path));
        await handleExpandField(expandedPath);

        // Wait for animation to complete
        if (container.current) {
          await new Promise<void>((resolve) => {
            const onAnimationRest = () => {
              container.current?.removeEventListener(
                "animation-onRest",
                onAnimationRest
              );
              resolve();
            };
            container.current.addEventListener(
              "animation-onRest",
              onAnimationRest
            );
          });
        }

        // Scroll to the label field (e.g., "yolo11")
        await handleScrollToField(path);
      },
    [handleExpandField, handleScrollToField, container]
  );

  useRegisterCommandHandler(
    modal
      ? ExpandAndScrollToFieldInModalCommand
      : ExpandAndScrollToFieldInGridCommand,
    useCallback(
      async (cmd) => {
        await handleExpandAndScrollToField(cmd.path);
      },
      [handleExpandAndScrollToField]
    )
  );
};
