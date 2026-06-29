/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Thin accessor hooks for the modal's 3D render state. Read-only wrappers
 * over the recoil atoms/selectors in `recoil/renderConfig3d.atoms.ts` and a
 * few related group selectors.
 *
 * Composite/mutation hooks (`useRenderConfig3dState`,
 * `useRenderConfig3dActions`, `useRenderConfig3dImperativeState`) live in
 * `hooks/useRenderConfig3d.ts`.
 *
 * The `useStable*` family holds the last settled value across loading
 * transitions so consumers don't suspend mid-navigation. They also treat
 * `GroupSampleNotFound` as a non-error (sparse groups legitimately
 * have no sample for the active slice); all other errors still bubble.
 */

import { useAtomValue } from "jotai";
import { useRef } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { ModalMode, modalMode } from "../../jotai/modal";
import {
  groupMediaIsCarouselVisible,
  groupMediaIsMain2DViewerVisible,
} from "../../recoil/groups";
import { GroupSampleNotFound, type ModalSample } from "../../recoil/modal";
import * as internals from "../../recoil/renderConfig3d.atoms";

/** Whether the 3D viewer is currently visible. */
export const useIs3dVisible = () =>
  useRecoilValue(internals.groupMediaIs3dVisible);

/** Persisted user preference for showing the 3D viewer. */
export const useIs3dVisibleSetting = () =>
  useRecoilValue(internals.groupMedia3dVisibleSetting);

/** Whether the 3D slice selection is pinned to a specific slice. */
export const useIs3dPinned = () => useRecoilValue(internals.is3dPinned);

/** Whether the current modal context exposes any 3D slice. */
export const useHas3dSlice = () => useRecoilValue(internals.has3dSlice);

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
  const is3d = useRecoilValue(internals.groupMediaIs3dVisible);
  const isAnnotate = useAtomValue(modalMode) === ModalMode.ANNOTATE;
  return isVisible && (!isAnnotate || !is3d);
};

/** The 3D slice names currently included in the rendered scene. */
export const useActive3dSlices = () => useRecoilValue(internals.active3dSlices);

/** Active non-FO3D 3D slices rendered alongside the scene. */
export const useActiveDirectSlices = () =>
  useRecoilValue(internals.activeNonFo3d3dSlices);

/** All available 3D slice names. */
export const useAll3dSlices = () => useRecoilValue(internals.all3dSlices);

/** All available non-3D slice names. */
export const useNon3dSlices = () => useRecoilValue(internals.allNon3dSlices);

/** Whether more than one 3D slice is available. */
export const useHasMultiple3dSlices = () =>
  useRecoilValue(internals.hasMultiple3dSlices);

/** Available 3D slices whose media resolves to FO3D files. */
export const useRealFo3dSlices = () => useRecoilValue(internals.realFo3dSlices);

/** Slice name currently pinned for 3D rendering, if any. */
export const usePinned3dSlice = () =>
  useRecoilValue(internals.pinned3DSampleSlice);

/** Active FO3D slice currently driving the scene, if one is selected. */
export const useActiveFo3dSlice = () =>
  useRecoilValue(internals.activeFo3dSlice);

/** Resolved samples for the currently active 3D slices. */
export const useActive3dSamplesMap = () =>
  useRecoilValue(internals.active3dSlicesToSampleMap);

/** Resolved samples for every available 3D slice in the current modal context. */
export const useAll3dSamplesMap = () =>
  useRecoilValue(internals.all3dSlicesToSampleMap);

/** Representative sample used for 3D interaction-driven behavior. */
export const useInteraction3dSample = () =>
  useRecoilValue(internals.interaction3dSample);

/** Sample currently used to render the visible 3D scene. */
export const useSceneSample3d = () => useRecoilValue(internals.sceneSample);

/** Parsed FO3D scene content cached for the active scene sample. */
export const useFo3dContent = () => useRecoilValue(internals.fo3dContent);

/**
 * Like useActive3dSamplesMap but holds the last settled value while loading.
 * Returns {} before the first value settles.
 */
export const useStableActive3dSamplesMap = (): Record<string, ModalSample> => {
  const loadable = useRecoilValueLoadable(internals.active3dSlicesToSampleMap);
  const ref = useRef<Record<string, ModalSample>>(
    loadable.state === "hasValue" ? loadable.contents : {},
  );
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  if (
    loadable.state === "hasError" &&
    !(loadable.contents instanceof GroupSampleNotFound)
  )
    throw loadable.contents;
  return ref.current;
};

/**
 * Like useAll3dSamplesMap but holds the last settled value while loading.
 * Returns {} before the first value settles.
 */
export const useStableAll3dSamplesMap = (): Record<string, ModalSample> => {
  const loadable = useRecoilValueLoadable(internals.all3dSlicesToSampleMap);
  const ref = useRef<Record<string, ModalSample>>(
    loadable.state === "hasValue" ? loadable.contents : {},
  );
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  if (
    loadable.state === "hasError" &&
    !(loadable.contents instanceof GroupSampleNotFound)
  )
    throw loadable.contents;
  return ref.current;
};

/**
 * Like useInteraction3dSample but holds the last settled value while loading.
 * Returns undefined before the first value settles — callers must guard.
 */
export const useStableInteraction3dSample = (): ModalSample | undefined => {
  const loadable = useRecoilValueLoadable(internals.interaction3dSample);
  const ref = useRef<ModalSample | undefined>(
    loadable.state === "hasValue" ? loadable.contents : undefined,
  );
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  if (
    loadable.state === "hasError" &&
    !(loadable.contents instanceof GroupSampleNotFound)
  )
    throw loadable.contents;
  return ref.current;
};

/**
 * Like useSceneSample3d but holds the last settled value while the selector is
 * re-fetching (e.g. during group-sample navigation). The 3D scene stays visible
 * instead of flickering to "Pixelating…". Returns undefined before the first
 * value settles — callers must guard (return null when undefined).
 */
export const useStableSceneSample3d = (): ModalSample | undefined => {
  const loadable = useRecoilValueLoadable(internals.sceneSample);
  const ref = useRef<ModalSample | undefined>(
    loadable.state === "hasValue" ? loadable.contents : undefined,
  );
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  if (
    loadable.state === "hasError" &&
    !(loadable.contents instanceof GroupSampleNotFound)
  )
    throw loadable.contents;
  return ref.current;
};

/**
 * Like useActiveFo3dSlice but holds the last settled value while loading.
 * Returns null before the first value settles (same as selector default).
 */
export const useStableActiveFo3dSlice = (): string | null => {
  const loadable = useRecoilValueLoadable(internals.activeFo3dSlice);
  const ref = useRef<string | null>(
    loadable.state === "hasValue" ? loadable.contents : null,
  );
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  if (
    loadable.state === "hasError" &&
    !(loadable.contents instanceof GroupSampleNotFound)
  )
    throw loadable.contents;
  return ref.current;
};

/**
 * Like useRealFo3dSlices but holds the last settled value while loading.
 * Returns [] before the first value settles.
 */
export const useStableRealFo3dSlices = (): string[] => {
  const loadable = useRecoilValueLoadable(internals.realFo3dSlices);
  const ref = useRef<string[]>(
    loadable.state === "hasValue" ? loadable.contents : [],
  );
  if (loadable.state === "hasValue") {
    ref.current = loadable.contents;
  }
  if (
    loadable.state === "hasError" &&
    !(loadable.contents instanceof GroupSampleNotFound)
  )
    throw loadable.contents;
  return ref.current;
};
