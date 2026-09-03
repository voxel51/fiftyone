import { useLighter } from "@fiftyone/lighter";
import type { Lookers } from "@fiftyone/looker";
import { useCurrentPublishedFrame } from "@fiftyone/playback";
import type { State } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import type { RecoilValueReadOnly } from "recoil";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { toLabelMap } from "./utils";

/**
 * Drop every selected label — from the atom, the canvas, and (through the
 * canvas) whatever else owns selection on this surface.
 *
 * The scene clear is deliberately NOT flagged. On a surface whose canvas
 * selection is reconciled from the annotation engine's active set (video
 * Explore), a flagged clear is invisible to the engine: the canvas and the
 * atom would empty while the engine went on believing those labels were
 * active, and the next time one of their tracks re-entered the projection the
 * engine would paint it selected again with nothing selected. Unflagged, the
 * deselects reach the engine and all three end up empty together.
 *
 * The echo back into the atom that this allows is harmless — it removes labels
 * that the `set` below removes anyway — and only reaches labels the scene is
 * actually painting, which is why the `set` still has to run.
 *
 * @param close optional popout dismissal; omitted when a keybinding calls this
 */
export const useClearSelectedLabels = (close?: () => void) => {
  const { scene } = useLighter();

  return useRecoilCallback(
    ({ set }) =>
      async () => {
        scene?.clearSelection();

        set(fos.selectedLabels, []);

        close?.();
      },
    [scene, close],
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
          // UNFLAGGED, for the reason `useClearSelectedLabels` documents: a
          // flagged select never reaches the annotation engine, so its active
          // set — which is what repaints an overlay that leaves the frame and
          // comes back — would not learn about this selection. Scrubbing away
          // and back would then mount every one of these labels unselected
          // while the atom still held them: N in the Tag count, none
          // highlighted.
          scene.clearSelection();

          visibleSelectableOverlayIds.forEach((overlayId) => {
            scene.selectOverlay(overlayId);
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

/** The shape of a Lighter overlay this module reads, and nothing more. */
export interface SelectableOverlay {
  id: string;
  field?: string;
  label?: {
    _id?: string;
    id?: string;
    frame_number?: number;
    instance?: { _id?: string } | null;
  } | null;
}

/**
 * One Lighter overlay as a {@link State.SelectedLabel}.
 *
 * Pure so it can be tested without a scene. `label._id` is the canonical
 * backend id the selection atoms key by; `overlay.id` is the engine's
 * instance id, which is only a last-resort fallback (an untracked element
 * with no `_id` would otherwise be unaddressable).
 *
 * A selection addresses ONE OCCURRENCE, not the whole track — the semantics
 * the video looker had, and the only ones the server's label ids can express:
 * `select_labels`' `labels` argument matches per-frame label documents, so a
 * track's `instance._id` in the `labelId` slot would match nothing. `frames.`
 * fields therefore carry `frameNumber`, and `instanceId` rides along for the
 * consumers that want the track (operator context, similarity queries).
 *
 * `frameNumber` must be PASSED IN: it is the playhead's frame, not a property
 * of the label. The looker read it from its own render state
 * (`overlays/base.ts`'s `getSelectData` -> `state.frameNumber`), and the
 * per-frame documents this pipeline paints from carry no `frame_number` field
 * of their own — only the frame document that contains them does. Reading one
 * off the label yielded `undefined` every time, which silently made every
 * frame-label selection frame-less.
 */
export const overlayToSelectedLabel = (
  overlay: SelectableOverlay,
  sampleId: string,
  frameNumber?: number,
): State.SelectedLabel => {
  const isFrameLabel = !!overlay.field?.startsWith(FRAME_FIELD_PREFIX);
  // Fall back to the label's own field for the sample-level pipelines that do
  // populate it; the video path supplies the playhead frame explicitly.
  const frame = frameNumber ?? overlay.label?.frame_number;
  const instanceId = overlay.label?.instance?._id;

  return {
    labelId: overlay.label?._id ?? overlay.label?.id ?? overlay.id,
    field: overlay.field as string,
    sampleId,
    // The looker stamped `"default"` for a plain click and `"alt"` only for
    // alt-click (a negative similarity query). Alt is not bound on the video
    // Explore surface, so every selection it makes is a default one.
    type: "default",
    ...(instanceId ? { instanceId } : {}),
    ...(isFrameLabel && frame !== undefined ? { frameNumber: frame } : {}),
  };
};

/**
 * The per-frame labels a Lighter scene is painting right now, as
 * {@link State.SelectedLabel}s.
 */
export const overlaysToFrameLabels = (
  overlays: readonly SelectableOverlay[],
  sampleId: string,
  frameNumber?: number,
): State.SelectedLabel[] =>
  overlays
    .filter((overlay) => overlay.field?.startsWith(FRAME_FIELD_PREFIX))
    .map((overlay) => overlayToSelectedLabel(overlay, sampleId, frameNumber));

/**
 * Visible per-frame labels, read off the Lighter scene rather than a
 * `VideoLooker`. Video Explore mounts no looker at all, so the looker's
 * `getCurrentFrameLabels()` is unavailable there; the scene holds exactly the
 * overlays on screen for the current frame, which is the same question.
 *
 * The frame comes from the surface's published playhead rather than a
 * `usePlayhead()` read: this hook is called from the modal's action bar, which
 * is a SIBLING of the media container, so the surface's `PlaybackProvider` is
 * not an ancestor of it.
 */
export const useVisibleFrameLabels = (): State.SelectedLabel[] => {
  const { scene } = useLighter();
  const sampleId = useRecoilValue(fos.modalSampleId);
  const frameNumber = useCurrentPublishedFrame();

  if (!scene) {
    return [];
  }

  return overlaysToFrameLabels(scene.getAllOverlays(), sampleId, frameNumber);
};

export const useUnselectVisible = (
  visibleIdsAtom?: RecoilValueReadOnly<Set<string>>,
  visibleIds?: Set<string>,
) => {
  const { scene } = useLighter();

  return useRecoilCallback(({ snapshot, set }) => async () => {
    if (scene) {
      // UNFLAGGED, matching `useSelectVisible` and `useClearSelectedLabels`:
      // the deselects have to reach the annotation engine, or its active set
      // goes on holding labels this just unselected and repaints them the
      // next time their track re-enters the projection.
      scene.clearSelection();
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
