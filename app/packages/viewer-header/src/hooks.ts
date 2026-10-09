/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import * as fos from "@fiftyone/state";
import { MEDIA_TYPE_MULTIMODAL } from "@fiftyone/utilities";
import { IconName, Variant } from "@voxel51/voodo";
import { useCallback } from "react";

/** The open sample: what the header names, and where it can step. */
export const useViewerSample = () => {
  const selector = fos.useModalSelector();
  const slice = fos.useModalGroupSlice();
  const position = fos.useModalPosition();

  return {
    /** A grouped sample is named by its group, as its URL is */
    id: selector?.groupId ?? selector?.id,
    slice: selector?.groupId ? slice : null,
    hasNext: Boolean(selector?.hasNext),
    hasPrevious: Boolean(selector?.hasPrevious),
    position,
  };
};

/** Closes the sample, back to the dataset. */
export const useCloseViewer = () => fos.useClearModal();

/** What the sample's tools depend on. */
export const useViewerContext = () => {
  const isGroup = fos.useIsGroupDataset();
  const isDynamicGroup = fos.useIsDynamicGroup();
  const exploring = fos.useModalMode() === fos.ModalMode.EXPLORE;
  const multimodal = fos.useIsMediaType(MEDIA_TYPE_MULTIMODAL);

  return { exploring, group: isGroup || isDynamicGroup, multimodal };
};

export const useViewerFullscreen = () => fos.useModalFullscreen();

/** The classic sidebar, which multimodal never mounts. */
export const useViewerSidebar = () => {
  const { toggle, visible } = fos.useModalSidebarVisible();
  const multimodal = fos.useIsMediaType(MEDIA_TYPE_MULTIMODAL);

  return { available: !multimodal, toggle, visible };
};

export const useViewerHiddenLabels = () => fos.useModalHiddenLabels();

/** Copies the page's URL, which names the open sample. */
export const useCopySampleLink = () => {
  const { setConfig } = fos.useActivityToast();

  return useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setConfig({
        iconName: IconName.Check,
        message: "Link copied",
        variant: Variant.Success,
      });
    } catch {
      setConfig({
        iconName: IconName.Error,
        message: "Could not copy the link",
        variant: Variant.Danger,
      });
    }
  }, [setConfig]);
};
