/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAtomValue } from "jotai";
import { useRef } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { ModalMode, modalMode } from "../../jotai/modal";
import {
  groupMediaIsCarouselVisible,
  groupMediaIsMain2DViewerVisible,
} from "../../recoil/groups";
import type { ModalSample } from "../../recoil/modal";
import * as internals from "../../recoil/renderConfig3d.atoms";

/** Returns whether the 3D viewer is currently visible in the modal. */
export const useIs3dVisible = () =>
  useRecoilValue(internals.groupMediaIs3dVisible);

/** Returns whether the 3D slice selection is currently pinned. */
export const useIs3dPinned = () => useRecoilValue(internals.is3dPinned);

/** Returns the list of 3D slice names currently active in the modal. */
export const useActive3dSlices = () => useRecoilValue(internals.active3dSlices);

/** Resolved samples for the currently active 3D slices. */
export const useActive3dSamplesMap = () =>
  useRecoilValue(internals.active3dSlicesToSampleMap);

/** Persisted user preference for showing the 3D viewer. */
export const useIs3dVisibleSetting = () =>
  useRecoilValue(internals.groupMedia3dVisibleSetting);

/** Slice name currently pinned for 3D rendering, if any. */
export const usePinned3dSlice = () =>
  useRecoilValue(internals.pinned3DSampleSlice);

/** Whether the carousel is visible. Always false in annotate mode. */
export const useIsGroupCarouselVisible = () => {
  const isVisible = useRecoilValue(groupMediaIsCarouselVisible);
  const isAnnotate = useAtomValue(modalMode) === ModalMode.ANNOTATE;
  return isVisible && !isAnnotate;
};

/**
 * Whether the 2D viewer is visible. In annotate mode, suppressed when the 3D
 * viewer is also visible so only one viewer shows at a time.
 */
export const useIsGroupMain2dViewerVisible = () => {
  const isVisible = useRecoilValue(groupMediaIsMain2DViewerVisible);
  const is3dVisible = useRecoilValue(internals.groupMediaIs3dVisible);
  const isAnnotate = useAtomValue(modalMode) === ModalMode.ANNOTATE;
  return isVisible && (!isAnnotate || !is3dVisible);
};

/**
 * Like useAll3dSamplesMap but holds the last settled value while loading.
 * Returns {} before the first value settles.
 */
export const useStableAll3dSamplesMap = (): Record<string, ModalSample> => {
  const loadable = useRecoilValueLoadable(internals.all3dSlicesToSampleMap);
  const ref = useRef<Record<string, ModalSample>>(
    loadable.state === "hasValue" ? loadable.contents : {}
  );
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  if (loadable.state === "hasError") throw loadable.contents;
  return ref.current;
};

/**
 * Like useInteraction3dSample but holds the last settled value while loading.
 * Returns undefined before the first value settles — callers must guard.
 */
export const useStableInteraction3dSample = (): ModalSample | undefined => {
  const loadable = useRecoilValueLoadable(internals.interaction3dSample);
  const ref = useRef<ModalSample | undefined>(
    loadable.state === "hasValue" ? loadable.contents : undefined
  );
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  if (loadable.state === "hasError") throw loadable.contents;
  return ref.current;
};
