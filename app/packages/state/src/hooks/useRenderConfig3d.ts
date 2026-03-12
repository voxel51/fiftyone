import { is3d } from "@fiftyone/utilities";
import { useMemo } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import {
  groupMediaIsCarouselVisibleSetting,
  groupMediaIsMain2DViewerVisibleSetting,
  groupMediaTypesMap,
} from "../recoil/groups";
import {
  areSlicesEqual,
  resolveNormalized3dSelection,
} from "../recoil/groups.utils";
import type { ModalSample } from "../recoil/modal";
import * as internals from "../recoil/renderConfig3d.atoms";

type RenderConfig3dSampleMap = Record<string, ModalSample>;

/**
 * Derived 3D modal state exposed by {@link useRenderConfig3dState}.
 */
export type RenderConfig3dState = {
  /** Active non-FO3D 3D slices rendered alongside the scene. */
  activeDirectSlices: string[];
  /** Active FO3D slice currently driving the scene, if one is selected. */
  activeFo3dSlice: string | null;
  /** Resolved samples for the currently active 3D slices. */
  activeSampleMap: RenderConfig3dSampleMap;
  /** Slice names currently participating in 3D rendering. */
  activeSlices: string[];
  /** Resolved samples for every available 3D slice in the current modal context. */
  allSampleMap: RenderConfig3dSampleMap;
  /** All available 3D slice names. */
  allSlices: string[];
  /** Parsed FO3D scene content cached for the active scene sample. */
  fo3dContent: unknown | null;
  /** Whether the current modal context exposes any 3D slice. */
  has3dSlice: boolean;
  /** Whether any available 3D slice resolves to an FO3D asset. */
  hasFo3dSlice: boolean;
  /** Whether more than one 3D slice is available. */
  hasMultipleSlices: boolean;
  /** Representative sample used for 3D interaction-driven behavior. */
  interactionSample: ModalSample;
  /** Slice corresponding to {@link RenderConfig3dState.interactionSample}. */
  interactionSlice: string | null;
  /** Whether the 3D viewer should currently be shown. */
  is3dVisible: boolean;
  /** Persisted user preference for showing the 3D viewer. */
  is3dVisibleSetting: boolean;
  /** Whether the 3D selection is pinned to a specific slice. */
  isPinned: boolean;
  /** All available non-3D slice names. */
  non3dSlices: string[];
  /** Slice name currently pinned for 3D rendering, if any. */
  pinnedSlice: string | null;
  /** Available 3D slices whose media resolves to FO3D files. */
  realFo3dSlices: string[];
  /** Sample currently used to render the visible 3D scene. */
  sceneSample: ModalSample;
};

/**
 * Mutation helpers exposed by {@link useRenderConfig3dActions}.
 */
export type RenderConfig3dActions = {
  /** Focuses a slice in the modal, switching between 2D and 3D modes as needed. */
  focusSlice: (sliceName: string) => Promise<void>;
  /** Seeds 3D state from the modal's current slice selection. */
  initializeFromModalSlice: (sliceName: string | null) => Promise<void>;
  /** Re-normalizes active and pinned slices after available samples change. */
  reconcileAvailableSlices: () => Promise<void>;
  /** Stores the parsed FO3D content for the active scene. */
  setFo3dContent: (content: unknown | null) => void;
  /** Pins or unpins the current 3D selection while preserving invariants. */
  setPinned: (pinned: boolean) => Promise<void>;
  /** Updates the persisted visibility setting for the 3D viewer. */
  setVisible: (visible: boolean) => void;
  /** Adds or removes a 3D slice from the active rendering set. */
  toggleSlice: (sliceName: string, enabled: boolean) => Promise<void>;
};

/**
 * Imperative snapshot query helpers exposed by {@link useRenderConfig3dImperativeState}.
 */
export type RenderConfig3dImperativeState = {
  /** Resolves the latest pinned status */
  getIsPinned: () => Promise<boolean>;
};

/**
 * Suspense-compatible 3D render state for React rendering.
 */
export const useRenderConfig3dState = (): RenderConfig3dState => {
  const is3dVisible = useRecoilValue(internals.groupMediaIs3dVisible);
  const is3dVisibleSetting = useRecoilValue(
    internals.groupMedia3dVisibleSetting
  );
  const isPinned = useRecoilValue(internals.is3dPinned);
  const has3dSlice = useRecoilValue(internals.has3dSlice);
  const hasFo3dSlice = useRecoilValue(internals.hasFo3dSlice);
  const pinnedSlice = useRecoilValue(internals.pinned3DSampleSlice);
  const activeSlices = useRecoilValue(internals.active3dSlices);
  const allSlices = useRecoilValue(internals.all3dSlices);
  const non3dSlices = useRecoilValue(internals.allNon3dSlices);
  const hasMultipleSlices = useRecoilValue(internals.hasMultiple3dSlices);
  const realFo3dSlices = useRecoilValue(internals.realFo3dSlices);
  const activeFo3dSlice = useRecoilValue(internals.activeFo3dSlice);
  const activeDirectSlices = useRecoilValue(internals.activeNonFo3d3dSlices);
  const interactionSample = useRecoilValue(internals.interaction3dSample);
  const interactionSlice = useRecoilValue(internals.interaction3dSlice);
  const sceneSample = useRecoilValue(internals.sceneSample);
  const fo3dContent = useRecoilValue(internals.fo3dContent);
  const activeSampleMap = useRecoilValue(internals.active3dSlicesToSampleMap);
  const allSampleMap = useRecoilValue(internals.all3dSlicesToSampleMap);

  return useMemo<RenderConfig3dState>(
    () => ({
      is3dVisible,
      is3dVisibleSetting,
      isPinned,
      has3dSlice,
      hasFo3dSlice,
      pinnedSlice,
      activeSlices,
      allSlices,
      non3dSlices,
      hasMultipleSlices,
      realFo3dSlices,
      activeFo3dSlice,
      activeDirectSlices,
      activeSampleMap,
      allSampleMap,
      interactionSample,
      interactionSlice,
      sceneSample,
      fo3dContent,
    }),
    [
      activeDirectSlices,
      activeFo3dSlice,
      activeSampleMap,
      activeSlices,
      allSampleMap,
      allSlices,
      fo3dContent,
      has3dSlice,
      hasFo3dSlice,
      hasMultipleSlices,
      interactionSample,
      interactionSlice,
      is3dVisible,
      is3dVisibleSetting,
      isPinned,
      non3dSlices,
      pinnedSlice,
      realFo3dSlices,
      sceneSample,
    ]
  );
};

/**
 * Imperative 3D render state queries for event handlers and callbacks.
 */
export const useRenderConfig3dImperativeState =
  (): RenderConfig3dImperativeState => {
    const getIsPinned = useRecoilCallback(
      ({ snapshot }) =>
        async () =>
          snapshot.getPromise(internals.is3dPinned),
      []
    );

    return useMemo<RenderConfig3dImperativeState>(
      () => ({
        getIsPinned,
      }),
      [getIsPinned]
    );
  };

/**
 * 3D render config mutation actions.
 */
export const useRenderConfig3dActions = (): RenderConfig3dActions => {
  const setFo3dContent = useRecoilCallback(
    ({ set }) =>
      (content: unknown | null) => {
        set(internals.fo3dContent, content);
      },
    []
  );

  const setPinned = useRecoilCallback(
    ({ snapshot, set }) =>
      async (pinned: boolean) => {
        if (!pinned) {
          set(internals.is3dPinned, false);
          return;
        }

        const samples = await snapshot.getPromise(
          internals.all3dSlicesToSampleMap
        );
        const all3dSlices = await snapshot.getPromise(internals.all3dSlices);
        const currentActive3dSlices = await snapshot.getPromise(
          internals.active3dSlices
        );
        const currentPinnedSlice = await snapshot.getPromise(
          internals.pinned3DSampleSlice
        );
        const currentRealFo3dSlices = await snapshot.getPromise(
          internals.realFo3dSlices
        );
        const { nextActive3dSlices, nextPinnedSlice } =
          resolveNormalized3dSelection({
            active3dSlices: currentActive3dSlices,
            all3dSlices,
            pinnedSlice: currentPinnedSlice,
            realFo3dSlices: currentRealFo3dSlices,
            samples,
          });

        if (!areSlicesEqual(currentActive3dSlices, nextActive3dSlices)) {
          set(internals.active3dSlices, nextActive3dSlices);
        }

        set(internals.pinned3DSampleSlice, nextPinnedSlice);
        set(internals.is3dPinned, Boolean(nextPinnedSlice));
      },
    []
  );

  const initializeFromModalSlice = useRecoilCallback(
    ({ snapshot, set }) =>
      async (sliceName: string | null) => {
        const mediaTypes = await snapshot.getPromise(groupMediaTypesMap);
        const isThreeD = sliceName ? is3d(mediaTypes[sliceName]) : false;

        if (!sliceName || !isThreeD) {
          set(internals.active3dSlices, []);
          set(internals.pinned3DSampleSlice, null);
          set(internals.is3dPinned, false);
          return;
        }

        set(internals.active3dSlices, [sliceName]);
        set(internals.pinned3DSampleSlice, sliceName);
        set(internals.is3dPinned, true);
      },
    []
  );

  const reconcileAvailableSlices = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        const samples = await snapshot.getPromise(
          internals.all3dSlicesToSampleMap
        );
        const all3dSlices = await snapshot.getPromise(internals.all3dSlices);
        const currentActive3dSlices = await snapshot.getPromise(
          internals.active3dSlices
        );
        const currentPinnedSlice = await snapshot.getPromise(
          internals.pinned3DSampleSlice
        );
        const currentRealFo3dSlices = await snapshot.getPromise(
          internals.realFo3dSlices
        );
        const { nextActive3dSlices, nextPinnedSlice } =
          resolveNormalized3dSelection({
            active3dSlices: currentActive3dSlices,
            all3dSlices,
            pinnedSlice: currentPinnedSlice,
            realFo3dSlices: currentRealFo3dSlices,
            samples,
          });

        if (!areSlicesEqual(currentActive3dSlices, nextActive3dSlices)) {
          set(internals.active3dSlices, nextActive3dSlices);
        }

        if (currentPinnedSlice !== nextPinnedSlice) {
          set(internals.pinned3DSampleSlice, nextPinnedSlice);
        }

        if (!nextPinnedSlice) {
          set(internals.is3dPinned, false);
        }
      },
    []
  );

  const toggleSlice = useRecoilCallback(
    ({ snapshot, set }) =>
      async (sliceName: string, enabled: boolean) => {
        const samples = await snapshot.getPromise(
          internals.all3dSlicesToSampleMap
        );
        const all3dSlices = await snapshot.getPromise(internals.all3dSlices);
        const currentActive3dSlices = await snapshot.getPromise(
          internals.active3dSlices
        );
        const currentPinnedSlice = await snapshot.getPromise(
          internals.pinned3DSampleSlice
        );
        const currentRealFo3dSlices = await snapshot.getPromise(
          internals.realFo3dSlices
        );

        const requestedActive3dSlices = enabled
          ? [...currentActive3dSlices, sliceName]
          : currentActive3dSlices.filter((slice) => slice !== sliceName);

        const { nextActive3dSlices, nextPinnedSlice } =
          resolveNormalized3dSelection({
            active3dSlices: requestedActive3dSlices,
            all3dSlices,
            pinnedSlice: currentPinnedSlice,
            preferredFo3dSlice: enabled ? sliceName : null,
            realFo3dSlices: currentRealFo3dSlices,
            samples,
          });

        if (!areSlicesEqual(currentActive3dSlices, nextActive3dSlices)) {
          set(internals.active3dSlices, nextActive3dSlices);
        }

        if (currentPinnedSlice !== nextPinnedSlice) {
          set(internals.pinned3DSampleSlice, nextPinnedSlice);
        }

        if (!nextPinnedSlice) {
          set(internals.is3dPinned, false);
        }
      },
    []
  );

  const setVisible = useRecoilCallback(
    ({ set }) =>
      (visible: boolean) => {
        set(internals.groupMedia3dVisibleSetting, visible);
      },
    []
  );

  const focusSlice = useRecoilCallback(
    ({ snapshot, set }) =>
      async (sliceName: string) => {
        const mediaTypes = await snapshot.getPromise(groupMediaTypesMap);
        const isThreeD = is3d(mediaTypes[sliceName]);

        if (!isThreeD) {
          set(groupMediaIsMain2DViewerVisibleSetting, true);
          set(internals.groupMedia3dVisibleSetting, false);
          set(groupMediaIsCarouselVisibleSetting, false);
          set(internals.is3dPinned, false);
          return;
        }

        const currentActive3dSlices = await snapshot.getPromise(
          internals.active3dSlices
        );
        const all3dSlices = await snapshot.getPromise(internals.all3dSlices);
        const currentRealFo3dSlices = await snapshot.getPromise(
          internals.realFo3dSlices
        );
        const samples = await snapshot.getPromise(
          internals.all3dSlicesToSampleMap
        );
        const { nextActive3dSlices } = resolveNormalized3dSelection({
          active3dSlices: [sliceName, ...currentActive3dSlices],
          all3dSlices,
          pinnedSlice: sliceName,
          preferredFo3dSlice: sliceName,
          realFo3dSlices: currentRealFo3dSlices,
          samples,
        });

        set(internals.groupMedia3dVisibleSetting, true);
        set(groupMediaIsMain2DViewerVisibleSetting, false);
        set(groupMediaIsCarouselVisibleSetting, false);
        set(internals.active3dSlices, nextActive3dSlices);
        set(internals.pinned3DSampleSlice, sliceName);
        set(internals.is3dPinned, true);
      },
    []
  );

  return useMemo<RenderConfig3dActions>(
    () => ({
      focusSlice,
      initializeFromModalSlice,
      reconcileAvailableSlices,
      setFo3dContent,
      setPinned,
      setVisible,
      toggleSlice,
    }),
    [
      focusSlice,
      initializeFromModalSlice,
      reconcileAvailableSlices,
      setFo3dContent,
      setPinned,
      setVisible,
      toggleSlice,
    ]
  );
};
