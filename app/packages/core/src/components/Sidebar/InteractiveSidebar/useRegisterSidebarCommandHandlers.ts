/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useRegisterCommandHandler } from "@fiftyone/commands";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import {
  CollapseFieldCommand,
  ExpandAndScrollToFieldCommand,
  ExpandFieldCommand,
  ScrollToFieldCommand,
} from "../../../commands";
import { InteractiveItems } from "./types";
import { getEntryKey } from "./utils";

/**
 * Hook that registers command handlers for sidebar field operations.
 * This should be called in InteractiveSidebar.
 */
export const useRegisterSidebarCommandHandlers = (
  container: React.RefObject<HTMLDivElement>,
  entries: fos.SidebarEntry[],
  items: React.MutableRefObject<InteractiveItems>
) => {
  const handleExpandField = useRecoilCallback(
    ({ set }) =>
      async (path: string, modal: boolean = false) => {
        set(fos.sidebarExpanded({ path, modal }), true);
      },
    []
  );

  useRegisterCommandHandler(
    ExpandFieldCommand,
    useCallback(
      async (cmd) => {
        await handleExpandField(cmd.path);
      },
      [handleExpandField]
    )
  );

  const handleCollapseField = useRecoilCallback(
    ({ set }) =>
      async (path: string, modal: boolean = false) => {
        set(fos.sidebarExpanded({ path, modal }), false);
      },
    []
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
    CollapseFieldCommand,
    useCallback(
      async (cmd) => {
        await handleCollapseFieldWithExpandedPath(cmd.path);
      },
      [handleCollapseFieldWithExpandedPath]
    )
  );

  // Handler: Scroll to field
  const handleScrollToField = useCallback(
    async (path: string, eventId?: string) => {
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
    ScrollToFieldCommand,
    useCallback(
      async (cmd) => {
        await handleScrollToField(cmd.path, cmd.eventId);
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

        // Wait for next frame to allow DOM to update
        await new Promise((resolve) => requestAnimationFrame(resolve));

        // Scroll to the label field (e.g., "yolo11")
        await handleScrollToField(path);
      },
    [handleExpandField, handleScrollToField]
  );

  useRegisterCommandHandler(
    ExpandAndScrollToFieldCommand,
    useCallback(
      async (cmd) => {
        await handleExpandAndScrollToField(cmd.path);
      },
      [handleExpandAndScrollToField]
    )
  );
};
