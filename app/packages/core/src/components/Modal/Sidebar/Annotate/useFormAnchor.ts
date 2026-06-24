import {
  refKey,
  useAnnotationEngine,
  useInteraction,
  type LabelRef,
} from "@fiftyone/annotation";
import { useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel, AnnotationLabelData } from "@fiftyone/state";
import { atom, getDefaultStore, type PrimitiveAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useAnnotationContext } from "./Edit/useAnnotationContext";
import {
  editingLabelAtom,
  pendingNewTypeAtom,
} from "./Edit/useAnnotationContext/atoms";
import { isNew as isNewSelector } from "./Edit/useAnnotationContext/selectors";
import useExit from "./Edit/useExit";

const STORE = getDefaultStore();

/**
 * Minimal overlay handle for an engine label with no mounted Lighter overlay
 * (a video frame label the canvas doesn't carry for the current playhead): the
 * form's coloring + field reads only need id + field + label. Same shape the
 * sidebar rows use; it never reaches Lighter.
 */
const stubOverlay = (
  id: string,
  field: string,
  label: AnnotationLabelData
): AnnotationLabel["overlay"] =>
  ({ id, field, label } as unknown as AnnotationLabel["overlay"]);

/**
 * Form follows the anchor: the engine's interaction anchor is the single
 * source of "which committed label is open for editing" — every surface
 * (2D canvas, 3D scene, sidebar rows) writes the anchor, and only this hook
 * writes `editing` for committed labels. `editing` survives as the form's
 * internal plumbing and as the surface-owned DRAFT slot: a pre-entity or
 * uncommitted draft holds the form until its own flow releases it, and the
 * anchor never clobbers it.
 *
 * The anchor's label resolves from the ENGINE for every surface — image,
 * temporal detection, video frame — at the anchor's full ref. The resolved
 * label lives in a per-anchor editing atom that an engine subscription keeps in
 * step with the engine while the form is open (a canvas transform or undo to
 * the open label flows back into the form; an in-progress edit survives because
 * it commits to the engine before any tick fires). The form's write sites read
 * `selected.ref` (the anchor) to address the engine in its own namespace.
 *
 * The atom carries the live Lighter overlay when the scene has one (so a field
 * move / geometry edit can drive the overlay directly) and a {@link stubOverlay}
 * otherwise (a video frame whose box isn't mounted for the current playhead).
 *
 * Applied in a layout effect (pre-paint): Lighter emits
 * deselect-then-select on selection change, and a post-paint apply flashes
 * the deselected frame.
 */
export const useFormAnchor = (): void => {
  const engine = useAnnotationEngine();
  const { scene } = useLighter();
  const anchor = useInteraction(engine, (i) => i.getAnchor());
  const { select } = useAnnotationContext();
  const onExit = useExit();

  // The surface-owned DRAFT lock, read REACTIVELY: while a pre-entity or
  // uncommitted draft holds the form, the anchor never clobbers it. Reading it
  // reactively (not a one-shot store peek) is what lets the effect re-run and
  // adopt the anchor the moment a surface releases its draft — e.g. a video
  // draw hands off to its committed engine label (see useSyncLighterAnnotation).
  const pendingNewType = useAtomValue(pendingNewTypeAtom);
  const isNewLabel = useAtomValue(isNewSelector);
  const isDraft = pendingNewType !== null || Boolean(isNewLabel);

  // single-slot cache for the resolved editing atom — one label is edited at a
  // time, so the atom is recreated only when the anchor ref changes. Reusing it
  // across re-selects of the same ref keeps the layout effect from re-selecting
  // in a loop and lets the engine subscription re-seed it in place.
  const resolved = useRef<{
    key: string;
    atom: PrimitiveAtom<AnnotationLabel>;
  } | null>(null);

  // build the editing-atom value from current engine truth. Form, overlay, and
  // engine share one namespace — the ref's full path (`frames.<field>` for a
  // frame field); the overlay is the live Lighter one when mounted (matched by
  // id + field), else a stub over the engine label.
  const build = useCallback(
    (ref: LabelRef, data: AnnotationLabelData): AnnotationLabel => {
      const field = ref.path;
      // the scene keys overlays by the track's `instance._id` (equal to the
      // doc `_id` for an untracked 2D label, but distinct for a per-frame video
      // track) — resolve the instance id so the live overlay (and its mask) is
      // found, mirroring the sidebar list resolution in `useLabels`
      const instanceId =
        (data as { instance?: { _id?: string } }).instance?._id ?? data._id;
      const mounted = scene?.getOverlay(instanceId as string);
      const live = mounted && mounted.field === field ? mounted : undefined;

      return {
        data,
        overlay:
          (live as AnnotationLabel["overlay"]) ??
          stubOverlay(data._id as string, field, data),
        path: field,
        type: engine.getLabelType(ref.path),
      } as AnnotationLabel;
    },
    [engine, scene]
  );

  useLayoutEffect(() => {
    const editingAtom = STORE.get(editingLabelAtom);

    // the draft lock is surface-owned
    if (isDraft) {
      return;
    }

    if (!anchor) {
      if (editingAtom) {
        onExit();
      }

      return;
    }

    const data = engine.getLabel(anchor);

    if (!data) {
      return;
    }

    const key = refKey(anchor);

    if (!resolved.current || resolved.current.key !== key) {
      resolved.current = {
        key,
        atom: atom<AnnotationLabel>(
          {} as AnnotationLabel
        ) as PrimitiveAtom<AnnotationLabel>,
      };
    }

    const labelAtom = resolved.current.atom;

    if (labelAtom !== editingAtom) {
      // (re)opening: seed from current engine truth, then point the form at it
      STORE.set(labelAtom, build(anchor, data as AnnotationLabelData));
      select(labelAtom, anchor);
    }
  }, [anchor, build, engine, isDraft, onExit, select]);

  // live engine → form sync for the open label. Re-seeds the editing atom on
  // engine change (canvas transform, undo, persisted reconcile), but only while
  // it is the active editing target and still the anchor's ref — never a draft,
  // never another surface's externally-managed atom. Skips no-op re-seeds so an
  // edit's own commit tick doesn't churn the form.
  useEffect(() => {
    return engine.subscribe(() => {
      const slot = resolved.current;

      if (!slot || !anchor || refKey(anchor) !== slot.key) {
        return;
      }

      if (STORE.get(editingLabelAtom) !== slot.atom) {
        return;
      }

      const data = engine.getLabel(anchor);

      if (!data) {
        return;
      }

      const next = build(anchor, data as AnnotationLabelData);
      const prev = STORE.get(slot.atom);

      if (JSON.stringify(prev?.data) !== JSON.stringify(next.data)) {
        STORE.set(slot.atom, next);
      }
    });
  }, [anchor, build, engine]);
};
