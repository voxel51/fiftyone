import { useLighter } from "@fiftyone/lighter";
import type { Lookers } from "@fiftyone/looker";
import type { State } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import type { RecoilValueReadOnly } from "recoil";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { toLabelMap } from "./utils";

export const useClearSelectedLabels = (close) => {
  const { scene } = useLighter();

  return useRecoilCallback(
    ({ set }) =>
      async () => {
        if (scene) {
          scene.clearSelection({ ignoreSideEffects: true });
        }

        set(fos.selectedLabels, []);

        close();
      },
    [],
  );
};

export const useClearSampleSelection = (close) => {
  const setSelected = fos.useSetSelected();

  return useCallback(() => {
    setSelected(new Map());
    close();
  }, [close, setSelected]);
};

export const useHideOthers = (
  visibleAtom?: RecoilValueReadOnly<State.SelectedLabel[]>,
  visible?: State.SelectedLabel[],
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabelIds);
    const result = visibleAtom
      ? await snapshot.getPromise(visibleAtom)
      : (visible ?? []);
    const hidden = await snapshot.getPromise(fos.hiddenLabels);
    set(fos.hiddenLabels, {
      ...hidden,
      ...toLabelMap(result.filter(({ labelId }) => !selected.has(labelId))),
    });
  });
};

export const useHideSelected = () => {
  return useRecoilCallback(({ snapshot, set, reset }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabelMap);
    const hidden = await snapshot.getPromise(fos.hiddenLabels);
    reset(fos.selectedLabels);
    set(fos.hiddenLabels, { ...hidden, ...selected });
  });
};

export const useSelectVisible = (
  visibleAtom?: RecoilValueReadOnly<fos.State.SelectedLabel[]> | null,
  visible?: fos.State.SelectedLabel[],
) => {
  const { scene } = useLighter();

  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabelMap);

    if (scene) {
      try {
        const visibleSelectableOverlayIds =
          scene.getVisibleSelectableOverlayIds();

        if (visibleSelectableOverlayIds.length > 0) {
          scene.clearSelection({ ignoreSideEffects: true });

          visibleSelectableOverlayIds.forEach((overlayId) => {
            scene.selectOverlay(overlayId, { ignoreSideEffects: true });
          });
        }
      } catch (error) {
        console.warn("Failed to select overlays in lighter scene:", error);
      }
    }

    set(fos.selectedLabelMap, {
      ...selected,
      ...toLabelMap(
        visibleAtom ? await snapshot.getPromise(visibleAtom) : visible || [],
      ),
    });
  });
};

export const useVisibleSampleLabels = (
  lookerRef?: MutableRefObject<Lookers | undefined>,
) => {
  const isGroup = useRecoilValue(fos.isGroup);
  const activeLabels = useRecoilValue(fos.activeLabels({}));

  const currentSampleLabels = lookerRef?.current
    ? lookerRef.current.getCurrentSampleLabels()
    : [];

  // Surfaces that render no `Looker` (video Explore paints through Lighter)
  // have no `getCurrentSampleLabels`. `activeLabels` walks the modal sample
  // against the active paths, which is the same sample-level set — it is
  // already the group path for exactly this reason.
  if (isGroup || !lookerRef?.current) {
    return activeLabels;
  }

  return currentSampleLabels;
};

/** `frames.`-prefixed overlays are the per-frame labels currently painted. */
const FRAME_FIELD_PREFIX = "frames.";

/**
 * The per-frame labels a Lighter scene is painting right now, as
 * {@link State.SelectedLabel}s.
 *
 * Pure so it can be tested without a scene. `label._id` is the canonical
 * backend id the selection atoms key by; `overlay.id` is the engine's
 * instance id, which is only a last-resort fallback (an untracked element
 * with no `_id` would otherwise be unaddressable).
 */
export const overlaysToFrameLabels = (
  overlays: readonly {
    id: string;
    field?: string;
    label?: { _id?: string; id?: string; frame_number?: number } | null;
  }[],
  sampleId: string,
): State.SelectedLabel[] =>
  overlays
    .filter((overlay) => overlay.field?.startsWith(FRAME_FIELD_PREFIX))
    .map((overlay) => {
      const frameNumber = overlay.label?.frame_number;

      return {
        labelId: overlay.label?._id ?? overlay.label?.id ?? overlay.id,
        field: overlay.field as string,
        sampleId,
        ...(frameNumber === undefined ? {} : { frameNumber }),
      };
    });

/**
 * Visible per-frame labels, read off the Lighter scene rather than a
 * `VideoLooker`. Video Explore mounts no looker at all, so the looker's
 * `getCurrentFrameLabels()` is unavailable there; the scene holds exactly the
 * overlays on screen for the current frame, which is the same question.
 */
export const useVisibleFrameLabels = (): State.SelectedLabel[] => {
  const { scene } = useLighter();
  const sampleId = useRecoilValue(fos.modalSampleId);

  if (!scene) {
    return [];
  }

  return overlaysToFrameLabels(scene.getAllOverlays(), sampleId);
};

export const useUnselectVisible = (
  visibleIdsAtom?: RecoilValueReadOnly<Set<string>>,
  visibleIds?: Set<string>,
) => {
  const { scene } = useLighter();

  return useRecoilCallback(({ snapshot, set }) => async () => {
    if (scene) {
      scene.clearSelection({ ignoreSideEffects: true });
    }

    const selected = await snapshot.getPromise(fos.selectedLabelMap);
    const result = visibleIdsAtom
      ? await snapshot.getPromise(visibleIdsAtom)
      : visibleIds;

    const filtered = Object.entries(selected).filter(
      ([label_id]) => !result?.has(label_id),
    );
    set(fos.selectedLabelMap, Object.fromEntries(filtered));
  });
};
