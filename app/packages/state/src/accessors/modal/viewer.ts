/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Accessor hooks for the sample viewer's chrome: what is open, and the
 * viewer-wide toggles its header drives.
 */

import { useReverbState, useReverbValue } from "@fiftyone/reverb";
import { useCallback } from "react";
import { fullscreen, hiddenLabels } from "../../atoms/atoms";
import {
  isNestedDynamicGroup,
  shouldRenderImaVidLooker,
} from "../../atoms/dynamicGroups";
import {
  groupMediaIsCarouselVisibleSetting,
  hasGroupSlices,
  modalGroupSlice,
} from "../../atoms/groups";
import { modalSelector } from "../../atoms/modal";
import { dynamicGroupsViewMode } from "../../atoms/options";
import { sidebarVisible } from "../../atoms/sidebar";
import type { ModalSelector } from "../../session";

/** The open sample's selector, or null when none is open. */
export const useModalSelector = (): ModalSelector | null =>
  useReverbValue(modalSelector);

/** The slice a grouped sample is open on. */
export const useModalGroupSlice = (): string | null =>
  useReverbValue(modalGroupSlice);

/** Whether the viewer is fullscreen, and a toggle for it. */
export const useModalFullscreen = () => {
  const [value, setValue] = useReverbState(fullscreen);
  const toggle = useCallback(() => setValue((current) => !current), [setValue]);

  return { fullscreen: value, toggle };
};

/** Whether the viewer's sidebar is shown, and a toggle for it. */
export const useModalSidebarVisible = () => {
  const [visible, setVisible] = useReverbState(sidebarVisible(true));
  const toggle = useCallback(
    () => setVisible((current) => !current),
    [setVisible],
  );

  return { toggle, visible };
};

/** How many labels the viewer hides, and a way to show them all again. */
export const useModalHiddenLabels = () => {
  const [hidden, setHidden] = useReverbState(hiddenLabels);
  const clear = useCallback(() => setHidden({}), [setHidden]);

  return { clear, count: Object.keys(hidden).length };
};

/** The carousel's visibility setting in the viewer, and its setter. */
export const useGroupCarouselVisibleSetting = () =>
  useReverbState(groupMediaIsCarouselVisibleSetting);

/** What decides which of a group's renderers the viewer can show. */
export const useModalGroupRenderers = () => {
  const nested = useReverbValue(isNestedDynamicGroup);
  const imaVid = useReverbValue(shouldRenderImaVidLooker(true));
  const viewMode = useReverbValue(dynamicGroupsViewMode(true));
  const slices = useReverbValue(hasGroupSlices);

  return {
    /** An ordered nested group plays as one video, so nothing toggles */
    imaVidInNestedGroup: nested && imaVid,
    sequential: nested || viewMode === "carousel" || slices,
  };
};
