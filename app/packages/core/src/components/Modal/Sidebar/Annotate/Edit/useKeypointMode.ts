import { FRAMES_PREFIX, useAnnotationEngine } from "@fiftyone/annotation";
import {
  GuidedKeypointHandler,
  InteractiveCreationHandler,
  InteractiveKeypointHandler,
  KeypointOverlay,
  KeypointPointHitAction,
  type KeypointPointHitContext,
  PolylineOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventBus,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useGetKeypointSkeleton, useIsPatchesView } from "@fiftyone/state";
import { KEYPOINT } from "@fiftyone/utilities";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { skeletonNodeCount } from "./useAnnotationContext/createNew";
import {
  type AnnotationContextSelected,
  type CreateOptions,
  useAnnotationContext,
  useAnnotationFields,
} from "./useAnnotationContext";
import useExit from "./useExit";

/**
 * Whether a 2D keypoint is the current selection. `PolylineOverlay` extends
 * `KeypointOverlay`, so the polyline case must be excluded explicitly.
 */
const is2dKeypointSelected = (
  selected: AnnotationContextSelected | null | undefined,
): boolean =>
  selected?.type === KEYPOINT &&
  selected.overlay instanceof KeypointOverlay &&
  !(selected.overlay instanceof PolylineOverlay);

const keypointModeActiveAtom = atom<boolean>(false);
export { keypointModeActiveAtom as _unsafeKeypointModeActiveAtom };

/**
 * Session-scoped set of keypoint overlay ids whose `lighter:overlay-establish`
 * has been dispatched. On a video frame field the FIRST committed placement of
 * a new label must establish it exactly once — establish is what births the
 * track (first keyframe, auto-extend, form handoff) — while every later
 * placement is an ordinary per-point edit. Ids are ~24 bytes and creations are
 * user actions — bounded in practice.
 */
const establishedKeypoints = new Set<string>();

/**
 * Overlay ids whose establish re-key must re-arm placement ONCE: committing a
 * video draft swaps the selection through null and back to the track (same
 * overlay id, new frame-label id), and the mode must survive its own creation
 * flow. One-shot — consumed by the selection effect's arming decision, so a
 * later user re-selection of the same track opens passively.
 */
const pendingRekeyArm = new Set<string>();

/**
 * Guided-placement state for the selected skeleton keypoint: the nodes the
 * user has skipped this session (skipped nodes stay `[NaN, NaN]` holes in the
 * label — "skipped" only means the guided cursor passes them). Keyed to an
 * overlay id so stale state never applies to a different label.
 */
type GuidedSkips = { overlayId: string; skipped: number[] };

// `null as ...` (not an explicit generic) so jotai resolves the writable
// primitive-atom overload — cf. `mergeTargetIdAtom` in useMergeTool.ts
const guidedSkipsAtom = atom(null as GuidedSkips | null);

/**
 * An explicit "place THIS node next" override (the checklist's Place button),
 * for re-placing a specific hole out of strict order — e.g. a hand coming
 * back after an occlusion, where strict order would offer some other hole
 * first. Honored only while that node is still a hole; cleared on placement
 * and on selection change.
 */
type ForcedTarget = { overlayId: string; index: number };
const forcedTargetAtom = atom(null as ForcedTarget | null);

/**
 * The node currently sub-selected for editing — set by canvas point clicks
 * and checklist row clicks alike (both flow through the overlay's
 * `keypoint-point-subselect` event). Drives the checklist row highlight and
 * the per-node inspector. Keyed to an overlay id so stale selection never
 * applies to a different label.
 */
type SelectedNode = { overlayId: string; index: number };
const selectedNodeAtom = atom(null as SelectedNode | null);

/**
 * Bumped whenever the selected keypoint's geometry changes (placement, drag,
 * undo), so derived guided state (target node, per-node status) recomputes.
 */
const guidedEpochAtom = atom(0);

/**
 * The node the next guided click places: the lowest-index hole that is not
 * skipped. `null` when every node is resolved (placed or skipped) — creation
 * is then complete. Free-form overlays (no skeleton) always return `null`.
 * Exported for tests.
 */
export const computeTargetIndex = (
  overlay: Pick<KeypointOverlay, "getRelativePoints">,
  nodeCount: number,
  skipped: readonly number[],
): number | null => {
  if (!nodeCount) return null;

  const points = overlay.getRelativePoints();
  for (let i = 0; i < points.length; i++) {
    if (skipped.includes(i)) continue;
    if (!Number.isFinite(points[i][0]) || !Number.isFinite(points[i][1])) {
      return i;
    }
  }

  return null;
};

/**
 * {@link computeTargetIndex} plus the explicit Place override: a forced node
 * wins while it is still a hole (whatever the skip set says), and strict
 * order resumes once it is placed. Exported for tests.
 */
export const resolveTargetIndex = (
  overlay: Pick<KeypointOverlay, "getRelativePoints">,
  nodeCount: number,
  skipped: readonly number[],
  forcedIndex: number | null,
): number | null => {
  if (forcedIndex !== null && nodeCount > 0) {
    const point = overlay.getRelativePoints()[forcedIndex];
    if (point && (!Number.isFinite(point[0]) || !Number.isFinite(point[1]))) {
      return forcedIndex;
    }
  }

  return computeTargetIndex(overlay, nodeCount, skipped);
};

/**
 * Skip state after skipping `targetIndex`: the node stays a hole and joins
 * the skip set, and skipping a Place-forced node moves the force to the next
 * hole down the list (or ends it at the bottom). Shared by the sidebar Skip
 * button and the canvas Shift+click. Exported for tests.
 */
export const skipTarget = (
  overlay: Pick<KeypointOverlay, "getRelativePoints">,
  nodeCount: number,
  skipped: readonly number[],
  forcedIndex: number | null,
  targetIndex: number,
): { skipped: number[]; forcedIndex: number | null } => ({
  skipped: skipped.includes(targetIndex)
    ? [...skipped]
    : [...skipped, targetIndex],
  forcedIndex:
    forcedIndex === targetIndex
      ? nextHoleBelow(overlay, nodeCount, targetIndex)
      : forcedIndex,
});

/**
 * The first hole strictly below `fromIndex`, whatever the skip set says.
 * A satisfied Place force chains downward through it: going back to fill
 * skipped nodes walks the rest of the list instead of stopping after one
 * placement. `null` when no hole remains below. Exported for tests.
 */
export const nextHoleBelow = (
  overlay: Pick<KeypointOverlay, "getRelativePoints">,
  nodeCount: number,
  fromIndex: number,
): number | null => {
  const points = overlay.getRelativePoints();
  for (let i = fromIndex + 1; i < nodeCount && i < points.length; i++) {
    if (!Number.isFinite(points[i][0]) || !Number.isFinite(points[i][1])) {
      return i;
    }
  }

  return null;
};

/**
 * Modifier policy for free-form keypoints: Alt-click on a point deletes it
 * (mirrors polyline mode). Skeleton keypoints never delete points — node
 * index is identity — so this resolver is only wired for free-form fields.
 */
const resolvePointHit = (ctx: KeypointPointHitContext) =>
  ctx.modifiers.altKey ? KeypointPointHitAction.DELETE : undefined;

/**
 * Read-only consumer hook for 2D keypoint annotation mode. Mirrors
 * {@link usePolylineMode}: returns the active flag, tooltip/disabled state,
 * and activate/deactivate/toggle methods. The handler lifecycle lives in
 * {@link useKeypointModeInstaller}, which must be called exactly once in the
 * modal tree.
 */
export const useKeypointMode = () => {
  const [keypointModeActive, setKeypointModeActive] = useAtom(
    keypointModeActiveAtom,
  );
  const isPatchView = useIsPatchesView();
  const { fields } = useAnnotationFields(KEYPOINT);
  const { createNew, lastUsed, readEditing } = useAnnotationContext();
  const exit = useExit();
  // ref so `deactivateKeypointMode` doesn't churn with every scene render
  const { scene } = useLighter();
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const noActiveFields = fields.length === 0;
  const disabled = isPatchView || noActiveFields;

  const tooltip = isPatchView
    ? "Editing keypoints is not supported in this view"
    : noActiveFields
      ? "No active fields"
      : keypointModeActive
        ? "Exit keypoint mode"
        : "Create new keypoints";

  /**
   * Arm the mode AND open a draft immediately (unlike the polyline flow,
   * which creates on first click): guided placement needs the node checklist
   * — "0 of N placed", first target highlighted — visible BEFORE the first
   * click, or the user is aiming blind.
   *
   * The draft is scene-only until the first placement: every placement
   * commits (the engine upserts the label on the first one, like polylines),
   * so a bail before any placement leaves nothing behind, and a bail after
   * one keeps exactly what was placed.
   */
  const activateKeypointMode = useCallback(() => {
    setKeypointModeActive(true);

    const field = lastUsed.fieldFor(KEYPOINT);
    const alreadyEditing = readEditing().isEditing;

    if (!alreadyEditing && field) {
      createNew(KEYPOINT, { field });
    }
  }, [createNew, lastUsed, readEditing, setKeypointModeActive]);

  /**
   * Leave keypoint mode, closing any open keypoint edit with it — the same
   * finalize the polyline/detection modes perform (see
   * `usePolylineMode.deactivatePolylineMode` for the right-click tiers this
   * keeps working).
   */
  const deactivateKeypointMode = useCallback(() => {
    sceneRef.current?.exitInteractiveMode();
    exit();
    setKeypointModeActive(false);
  }, [exit, setKeypointModeActive]);

  const toggleKeypointMode = useCallback(() => {
    if (keypointModeActive) {
      deactivateKeypointMode();
    } else {
      activateKeypointMode();
    }
  }, [keypointModeActive, activateKeypointMode, deactivateKeypointMode]);

  return useMemo(
    () => ({
      keypointModeActive,
      disabled,
      tooltip,
      activateKeypointMode,
      deactivateKeypointMode,
      toggleKeypointMode,
    }),
    [
      keypointModeActive,
      disabled,
      tooltip,
      activateKeypointMode,
      deactivateKeypointMode,
      toggleKeypointMode,
    ],
  );
};

/**
 * Guided-placement state for the currently selected skeleton keypoint —
 * consumed by the sidebar node checklist and the skip control.
 *
 * `targetIndex` is the node the next click places (`null` once every node is
 * resolved, or for free-form fields), `skipped` the indices the guided cursor
 * passed over, and `skip()` advances past the current target. Placement
 * status itself is derived from the overlay's live geometry — a node is
 * "placed" iff its point is finite.
 */
export const useGuidedKeypoints = () => {
  const { selected } = useAnnotationContext();
  const modeActive = useAtomValue(keypointModeActiveAtom);
  const getSkeleton = useGetKeypointSkeleton();
  const [skips, setSkips] = useAtom(guidedSkipsAtom);
  const [forced, setForced] = useAtom(forcedTargetAtom);
  // subscribe: recompute on every geometry change
  useAtomValue(guidedEpochAtom);
  const { scene } = useLighter();

  // The selection context captures its overlay REFERENCE at selection time,
  // but a settled save rebases the sample and remounts scene overlays — the
  // captured instance is then detached (its dispatches and geometry edits go
  // nowhere). Overlay ids are stable across the remount, so resolve the live
  // instance by id at every use; the captured one is the fallback (e.g. a
  // track's overlay unmounted off-extent).
  const contextOverlay = is2dKeypointSelected(selected)
    ? (selected?.overlay as KeypointOverlay)
    : null;
  const resolveOverlay = useCallback((): KeypointOverlay | null => {
    if (!contextOverlay) {
      return null;
    }
    const live = scene?.getOverlay(contextOverlay.id);
    return live instanceof KeypointOverlay ? live : contextOverlay;
  }, [contextOverlay, scene]);
  const overlay = resolveOverlay();
  const field = selected?.field ?? null;
  const skeleton = field ? getSkeleton(field) : null;
  const nodeCount = skeletonNodeCount(skeleton);

  const skipped = useMemo(
    () => (overlay && skips?.overlayId === overlay.id ? skips.skipped : []),
    [overlay, skips],
  );

  const forcedIndex =
    overlay && forced?.overlayId === overlay.id ? forced.index : null;

  const targetIndex = overlay
    ? resolveTargetIndex(overlay, nodeCount, skipped, forcedIndex)
    : null;

  /**
   * Skip the current target node: it stays a `[NaN, NaN]` hole and the guided
   * cursor moves on. When this resolves the last node, guided placement is
   * complete and the interactive handler is released (the overlay stays
   * selected for editing).
   */
  const skip = useCallback(() => {
    const target = resolveOverlay();
    if (!target || targetIndex === null) return;

    const next = skipTarget(
      target,
      nodeCount,
      skipped,
      forcedIndex,
      targetIndex,
    );
    setSkips({ overlayId: target.id, skipped: next.skipped });
    // Skipping a Place-forced node keeps the chain walking: the force moves
    // to the next hole down the list, or ends at the bottom
    if (forcedIndex === targetIndex) {
      setForced(
        next.forcedIndex === null
          ? null
          : { overlayId: target.id, index: next.forcedIndex },
      );
    }

    if (computeTargetIndex(target, nodeCount, next.skipped) === null) {
      scene?.exitInteractiveMode();
    }
  }, [
    forcedIndex,
    nodeCount,
    resolveOverlay,
    scene,
    setForced,
    setSkips,
    skipped,
    targetIndex,
  ]);

  const bumpGuidedEpoch = useSetAtom(guidedEpochAtom);

  /**
   * Clear a placed node back to a `[NaN, NaN]` hole. A node is never deleted
   * (its index is its identity), only placed or a hole. On a committed video
   * track this is an ordinary edit: the clear commits, promotes the current
   * frame to a keyframe, and the bracketing segments re-lerp — with the hole
   * rule (either endpoint a hole → the span is a hole), the node vanishes
   * from this keyframe until the next keyframe that places it again.
   */
  const clearNode = useCallback(
    (index: number) => {
      const target = resolveOverlay();
      if (!target) return;

      const pointId = target.getPointIdAt(index);
      const from = pointId ? target.getPointById(pointId)?.position : null;
      if (
        !pointId ||
        !from ||
        !Number.isFinite(from[0]) ||
        !Number.isFinite(from[1])
      ) {
        return;
      }

      // The emitted move commits through the engine, which records the undo
      // step. Pushing a Lighter command too would double-record the clear
      // (see useLighterEngineBridge's external undo authority).
      target.movePointById(pointId, [NaN, NaN], true);

      // Clearing IS skipping: the node is deliberately a hole now, so the
      // guided cursor passes it rather than immediately re-arming its
      // placement. Re-placing is explicit — the row's Place button.
      if (!skipped.includes(index)) {
        setSkips({ overlayId: target.id, skipped: [...skipped, index] });
      }
      if (forcedIndex === index) {
        setForced(null);
      }

      bumpGuidedEpoch((n) => n + 1);
    },
    [
      bumpGuidedEpoch,
      forcedIndex,
      resolveOverlay,
      setForced,
      setSkips,
      skipped,
    ],
  );

  /**
   * Aim the next click at a specific hole — the checklist's Place button.
   * Un-skips the node and force-targets it, so re-placing a cleared node
   * (a hand coming back into frame) doesn't wait its strict-order turn.
   * Also (re)arms keypoint mode: an existing label opens passively, and this
   * button is its explicit way into placement.
   */
  const setKeypointModeActive = useSetAtom(keypointModeActiveAtom);
  const placeNode = useCallback(
    (index: number) => {
      const target = resolveOverlay();
      if (!target) return;

      if (skipped.includes(index)) {
        setSkips({
          overlayId: target.id,
          skipped: skipped.filter((i) => i !== index),
        });
      }
      setForced({ overlayId: target.id, index });
      setKeypointModeActive(true);
    },
    [resolveOverlay, setForced, setKeypointModeActive, setSkips, skipped],
  );

  const selectedNode = useAtomValue(selectedNodeAtom);
  const selectedNodeIndex =
    overlay && selectedNode?.overlayId === overlay.id
      ? selectedNode.index
      : null;

  /**
   * Sub-select a node for editing (or clear with null). Routed through the
   * overlay so the canvas and the checklist share one selection — the
   * overlay dispatches `keypoint-point-subselect`, which the installer
   * mirrors into sidebar state.
   */
  const selectNode = useCallback(
    (index: number | null) => {
      resolveOverlay()?.selectPoint(index);
    },
    [resolveOverlay],
  );

  return {
    /** Node labels, when the skeleton defines them. */
    nodeLabels: skeleton?.labels ?? null,
    nodeCount,
    /**
     * Whether keypoint mode is armed — i.e. whether a canvas click places the
     * target node. Drives the checklist rows' action buttons; an existing
     * label opens passively, so an unarmed target row offers Place.
     */
    modeActive,
    /** Live relative points — `[NaN, NaN]` entries are unplaced holes. */
    points: overlay?.getRelativePoints() ?? null,
    targetIndex,
    skipped,
    skip,
    clearNode,
    placeNode,
    /** Node sub-selected for editing (row/canvas click), or null. */
    selectedNodeIndex,
    selectNode,
    /**
     * True while a new label has nothing placed yet — it exists only in the
     * scene (the first placement is what commits it), so attribute edits
     * have no label to land on and the per-node inspector hides.
     */
    isDraft:
      !!selected?.isNew &&
      !!overlay &&
      !overlay
        .getRelativePoints()
        .some((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])),
  };
};

/**
 * Owner hook for the 2D keypoint annotation handler lifecycle. Must be called
 * exactly once per modal scene — from `useBridge` (and the video surface's
 * annotation sync). Mirrors {@link usePolylineModeInstaller}.
 *
 * Handler matrix while the mode is active:
 *
 * - No keypoint selected → {@link InteractiveCreationHandler}: the first
 *   click creates the label (skeleton fields: all nodes as holes, node 0 at
 *   the click) and selection moves to it.
 * - Skeleton keypoint selected with unresolved nodes →
 *   {@link GuidedKeypointHandler}: each click places the next node in order.
 * - Free-form keypoint selected → {@link InteractiveKeypointHandler}: each
 *   click appends a point; Alt-click deletes; double-click finishes.
 * - Skeleton keypoint selected, all nodes resolved → no handler: points drag
 *   through the overlay's own interaction, clicking empty space deselects.
 */
export const useKeypointModeInstaller = (): void => {
  const keypointModeActive = useAtomValue(keypointModeActiveAtom);
  const setKeypointModeActive = useSetAtom(keypointModeActiveAtom);
  const setSkips = useSetAtom(guidedSkipsAtom);
  const setGuidedEpoch = useSetAtom(guidedEpochAtom);
  // The install effect observes geometry changes too: undoing a placement
  // after auto-finish turns a node back into a hole, and the guided handler
  // must reinstall so the next click can re-place it.
  const guidedEpoch = useAtomValue(guidedEpochAtom);
  const setForced = useSetAtom(forcedTargetAtom);
  const getSkeleton = useGetKeypointSkeleton();
  const { scene, removeOverlay } = useLighter();
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );
  const { selected, createNew, readEditing } = useAnnotationContext();
  const useLighterEvent = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  // Overlays mount / unmount as the playhead crosses a track's extent (see
  // usePolylineModeInstaller); bump an epoch so the install effect re-runs.
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const bumpEpoch = useCallback(() => setSceneEpoch((n) => n + 1), []);
  useLighterEvent("lighter:overlay-added", bumpEpoch);
  useLighterEvent("lighter:overlay-removed", bumpEpoch);

  // Geometry changes (guided placement, drags, undo/redo) recompute the
  // guided target and the sidebar checklist.
  const bumpGuidedEpoch = useCallback(
    () => setGuidedEpoch((n) => n + 1),
    [setGuidedEpoch],
  );
  useLighterEvent("lighter:keypoint-point-moved", bumpGuidedEpoch);
  useLighterEvent("lighter:keypoint-point-added", bumpGuidedEpoch);
  useLighterEvent("lighter:keypoint-point-deleted", bumpGuidedEpoch);
  // Undo/redo are engine-owned: they write the store, and the Lighter bridge
  // applies the result to the overlay silently (no point events). Observe the
  // engine too, or an undone placement would leave the checklist and the
  // guided target stale.
  const engine = useAnnotationEngine();
  useEffect(
    () => engine.subscribeChanges(bumpGuidedEpoch),
    [bumpGuidedEpoch, engine],
  );

  // Mirror the overlay's per-point sub-selection into sidebar state — canvas
  // point clicks and checklist row clicks both dispatch this event, so the
  // row highlight and inspector track one source of truth.
  const setSelectedNode = useSetAtom(selectedNodeAtom);
  useLighterEvent(
    "lighter:keypoint-point-subselect",
    useCallback(
      (event: { overlayId: string; pointIndex: number | null }) => {
        setSelectedNode(
          event.pointIndex === null
            ? null
            : { overlayId: event.overlayId, index: event.pointIndex },
        );
      },
      [setSelectedNode],
    ),
  );

  // A right-click on the keypoint being edited is a confirm, not a bail (see
  // the selection effect below). Recorded at gesture time, while the mode is
  // still armed; the deselect it precedes consumes it.
  const keypointModeActiveRef = useRef(keypointModeActive);
  keypointModeActiveRef.current = keypointModeActive;
  const rightClickConfirmedRef = useRef<ReadonlySet<string>>(new Set());
  useLighterEvent(
    "lighter:right-click-deselect",
    useCallback((event: { overlayIds: string[] }) => {
      rightClickConfirmedRef.current = keypointModeActiveRef.current
        ? new Set(event.overlayIds)
        : new Set();
    }, []),
  );

  // Any establish counts, wherever it came from (the first-placement
  // dispatch below, or a free-form handler's double-click finish), so a
  // label is never established twice. Non-keypoint overlay ids are inert.
  useLighterEvent(
    "lighter:overlay-establish",
    useCallback((event: { overlayId: string }) => {
      establishedKeypoints.add(event.overlayId);
    }, []),
  );

  const installedHandlerRef = useRef<
    | GuidedKeypointHandler
    | InteractiveKeypointHandler
    | InteractiveCreationHandler
    | null
  >(null);

  const exitInstalledHandler = useCallback(() => {
    if (!installedHandlerRef.current) {
      return;
    }

    scene?.exitInteractiveMode();
    installedHandlerRef.current = null;
  }, [scene]);

  // Selection drives the mode, and — unlike polyline mode — the mode lives
  // exactly as long as a keypoint is selected: the mode opens a draft on
  // activation, so "armed with nothing selected" is the aiming-blind state
  // the eager draft exists to prevent. A background click (deselect) or a
  // switch to another label therefore exits the mode. A new label with
  // nothing placed exists only in the scene (the first placement is the
  // commit), so a bail discards its overlay rather than leaving a ghost.
  //
  // Only a NEW label auto-arms placement. Selecting an EXISTING keypoint
  // with holes opens it passively — inspection is not an invitation to
  // place, and arming is explicit (the action button, or a checklist row's
  // Place button). (Tim, 2026-09-21.)
  //
  // The one deselect that keeps the mode: a right-click on a keypoint with
  // anything placed confirms it (unplaced nodes stay holes) and opens the
  // next draft on the same field, so the next click places the first node of
  // the next instance — the detection/polyline cadence. A right-click on a
  // nothing-placed draft still exits, so a second right-click leaves the
  // mode. (Eric, 2026-09-23.)
  const prevSelectedRef = useRef(selected);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selected;

    const isKeypoint2d = is2dKeypointSelected(selected);
    const wasKeypoint2d = is2dKeypointSelected(prev);
    const selectionChanged = prev?.overlay?.id !== selected?.overlay?.id;

    if (isKeypoint2d) {
      if (selectionChanged) {
        setKeypointModeActive(
          !!selected?.isNew ||
            pendingRekeyArm.delete(selected?.overlay?.id ?? ""),
        );
      }
    } else if (wasKeypoint2d) {
      const prevId = prev?.overlay?.id;
      const prevOverlay = prevId ? scene?.getOverlay(prevId) : undefined;
      const hasPlacement =
        prevOverlay instanceof KeypointOverlay &&
        prevOverlay
          .getRelativePoints()
          .some((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      const confirmed = !!prevId && rightClickConfirmedRef.current.has(prevId);
      rightClickConfirmedRef.current = new Set();

      if (confirmed && hasPlacement && !selected && prev?.field) {
        createNew(KEYPOINT, { field: prev.field });
      } else {
        setKeypointModeActive(false);

        // Discard the abandoned draft's scene overlay (deselect paths bypass
        // useExit's cleanup)
        if (
          prev?.isNew &&
          prevId &&
          prevOverlay instanceof KeypointOverlay &&
          !hasPlacement
        ) {
          removeOverlay(prevId, true);
        }
      }
    }

    // Selection changed to a different overlay: stale skip / Place / node
    // sub-selection state never carries over.
    if (selectionChanged) {
      setSkips(null);
      setForced(null);
      setSelectedNode(null);
    }
  }, [
    createNew,
    removeOverlay,
    scene,
    selected,
    setForced,
    setKeypointModeActive,
    setSelectedNode,
    setSkips,
  ]);

  // The edit form's Field picker is how a different skeleton is chosen. A
  // committed label's swap moves its engine rows AND erases its geometry as
  // one undoable unit (see Field.tsx — a node's index is bound to the old
  // skeleton's semantics, so node 3 of a face is not node 3 of a body); a
  // nothing-placed draft has no rows to move and reseeds locally here. Either
  // way the per-node UI state (skips, Place force, sub-selection) is bound to
  // the old skeleton and never carries over.
  const prevFieldRef = useRef<string | null>(null);
  useEffect(() => {
    const field = selected?.field ?? null;
    const prevField = prevFieldRef.current;
    prevFieldRef.current = field;

    if (
      !scene ||
      !field ||
      !prevField ||
      prevField === field ||
      !is2dKeypointSelected(selected)
    ) {
      return;
    }

    setSkips(null);
    setForced(null);
    setSelectedNode(null);
    bumpGuidedEpoch();

    if (!selected?.isNew) {
      return;
    }

    const overlay = scene.getOverlay(selected.overlay?.id ?? "");
    if (!(overlay instanceof KeypointOverlay)) {
      return;
    }
    // Anything placed = already committed; Field.tsx handled the move+erase
    // and the bridge re-homes the overlay. (Post-erase this reseed would be
    // an identical no-op anyway.)
    if (
      overlay
        .getRelativePoints()
        .some((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    ) {
      return;
    }

    const skeleton = getSkeleton(field);
    const nodeCount = skeletonNodeCount(skeleton);
    overlay.setConnections(skeleton?.edges ?? []);
    overlay.applyLabel({
      ...overlay.label,
      points: Array.from({ length: nodeCount }, () => [NaN, NaN]),
    });
    bumpGuidedEpoch();
  }, [
    bumpGuidedEpoch,
    getSkeleton,
    scene,
    selected,
    setForced,
    setSelectedNode,
    setSkips,
  ]);

  // Stable ref so the creation handler's `onCreate` always sees the latest
  // create function without swapping the installed handler.
  const createKeypoint = useCallback(
    (options?: CreateOptions) => createNew(KEYPOINT, options),
    [createNew],
  );
  const createKeypointRef = useRef(createKeypoint);
  createKeypointRef.current = createKeypoint;

  // The guided handler resolves its target through these refs so skip /
  // Place updates take effect without reinstalling the handler.
  const currentSkips = useAtomValue(guidedSkipsAtom);
  const currentSkipsRef = useRef(currentSkips);
  currentSkipsRef.current = currentSkips;
  const currentForced = useAtomValue(forcedTargetAtom);
  const currentForcedRef = useRef(currentForced);
  currentForcedRef.current = currentForced;

  // Per-point commits: every emitted point event already committed through
  // the engine bridge (the first one upserts the label). On a video FRAME
  // field, a new label's first placement must ALSO establish the overlay —
  // establish is what births the track (first keyframe, auto-extend, form
  // handoff) — exactly once, mirroring the polyline creation flow. Image
  // fields need no establish: the point commit is the whole story.
  const establishOnFirstPlacement = useCallback(
    (event: { overlayId: string }) => {
      // Fresh snapshot: the creation handler's first placement fires this in
      // the same tick `createNew` selected the label, before any re-render.
      const editing = readEditing().selected;
      if (
        !editing?.isNew ||
        !is2dKeypointSelected(editing) ||
        editing.overlay?.id !== event.overlayId ||
        !editing.field?.startsWith(FRAMES_PREFIX) ||
        establishedKeypoints.has(event.overlayId)
      ) {
        return;
      }

      const overlay = scene?.getOverlay(event.overlayId);
      if (!(overlay instanceof KeypointOverlay)) {
        return;
      }

      establishedKeypoints.add(overlay.id);
      pendingRekeyArm.add(overlay.id);

      // Fold the sidebar draft's fields (class, attributes picked before the
      // first placement) into the overlay label the commit extraction reads,
      // keeping the live geometry authoritative.
      overlay.applyLabel({
        ...overlay.label,
        ...((editing.data as Record<string, unknown>) ?? {}),
        points: overlay.getRelativePoints(),
      } as typeof overlay.label);

      // The consumers read geometry from the overlay / engine anchor, not
      // this payload — a zero rect satisfies the event shape
      const bounds = { x: 0, y: 0, width: 0, height: 0 };
      eventBus.dispatch("lighter:overlay-establish", {
        id: "guided-keypoint-establish",
        overlayId: overlay.id,
        handler: installedHandlerRef.current ?? undefined,
        startBounds: bounds,
        startPosition: { x: bounds.x, y: bounds.y },
        bounds,
      });
    },
    [eventBus, readEditing, scene],
  );
  useLighterEvent("lighter:keypoint-point-moved", establishOnFirstPlacement);
  useLighterEvent("lighter:keypoint-point-added", establishOnFirstPlacement);

  useEffect(() => {
    if (!scene) {
      return;
    }

    if (!keypointModeActive) {
      exitInstalledHandler();
      return;
    }

    const candidate = is2dKeypointSelected(selected)
      ? (selected!.label!.overlay as KeypointOverlay | undefined)
      : undefined;

    // Look the overlay up live by id — a selected track's overlay unmounts on
    // frames outside its extent (see usePolylineModeInstaller for the full
    // story); treat "selected but off-extent" as "nothing to edit".
    const targetOverlay = candidate
      ? (scene.getOverlay(candidate.id) as KeypointOverlay | undefined)
      : undefined;

    if (targetOverlay) {
      const field = selected?.field ?? null;
      const skeleton = field ? getSkeleton(field) : null;
      const nodeCount = skeletonNodeCount(skeleton);

      if (nodeCount > 0) {
        // Skeleton field: guided placement while unresolved nodes remain.
        // getDefaultStore-free read: the handler re-resolves the target on
        // every click, so the closure only needs the atoms' setters.
        const getTarget = () => {
          const skips = currentSkipsRef.current;
          const skipped =
            skips?.overlayId === targetOverlay.id ? skips.skipped : [];
          const forced = currentForcedRef.current;
          const forcedIndex =
            forced?.overlayId === targetOverlay.id ? forced.index : null;
          return resolveTargetIndex(
            targetOverlay,
            nodeCount,
            skipped,
            forcedIndex,
          );
        };

        if (getTarget() === null) {
          // All nodes resolved — plain editing via the overlay's own handlers
          exitInstalledHandler();
          return;
        }

        if (
          installedHandlerRef.current instanceof GuidedKeypointHandler &&
          installedHandlerRef.current.overlay === targetOverlay
        ) {
          return;
        }

        exitInstalledHandler();

        const handler = new GuidedKeypointHandler(targetOverlay, {
          getTargetIndex: getTarget,
          getNodeLabel: (index) => skeleton?.labels?.[index] ?? null,
          onPlaced: () => {
            // A satisfied Place force CHAINS: the target advances to the
            // next hole down the list (skipped or not), so going back to
            // fill skipped nodes walks the list instead of stopping after
            // one placement. No hole below ends the chain and strict order
            // resumes.
            const forced = currentForcedRef.current;
            const forcedIndex =
              forced?.overlayId === targetOverlay.id ? forced.index : null;
            if (forcedIndex !== null) {
              const next = nextHoleBelow(targetOverlay, nodeCount, forcedIndex);
              setForced(
                next === null
                  ? null
                  : { overlayId: targetOverlay.id, index: next },
              );
            }
            bumpGuidedEpoch();
            // Auto-finish: release the handler once every node is resolved;
            // the overlay stays selected for editing.
            if (getTarget() === null) {
              exitInstalledHandler();
            }
          },
          // Shift+click: the sidebar Skip, from the canvas
          onSkip: (index) => {
            const skips = currentSkipsRef.current;
            const skipped =
              skips?.overlayId === targetOverlay.id ? skips.skipped : [];
            const forced = currentForcedRef.current;
            const forcedIndex =
              forced?.overlayId === targetOverlay.id ? forced.index : null;
            const next = skipTarget(
              targetOverlay,
              nodeCount,
              skipped,
              forcedIndex,
              index,
            );

            setSkips({ overlayId: targetOverlay.id, skipped: next.skipped });
            if (forcedIndex === index) {
              setForced(
                next.forcedIndex === null
                  ? null
                  : { overlayId: targetOverlay.id, index: next.forcedIndex },
              );
            }
            bumpGuidedEpoch();
            // Auto-finish, as after a placement. The refs still hold the
            // pre-skip state until the next render, so resolve from `next`.
            if (
              resolveTargetIndex(
                targetOverlay,
                nodeCount,
                next.skipped,
                next.forcedIndex,
              ) === null
            ) {
              exitInstalledHandler();
            }
          },
        });

        scene.enterInteractiveMode(handler);
        installedHandlerRef.current = handler;
        return;
      }

      // Free-form field: click-to-append via the existing handler
      if (
        installedHandlerRef.current instanceof InteractiveKeypointHandler &&
        installedHandlerRef.current.overlay === targetOverlay
      ) {
        return;
      }

      exitInstalledHandler();

      const handler = new InteractiveKeypointHandler(
        targetOverlay,
        eventBus,
        undefined,
        resolvePointHit,
      );

      scene.enterInteractiveMode(handler);
      installedHandlerRef.current = handler;
      return;
    }

    // Mode active, no keypoint selected; install creation handler
    if (installedHandlerRef.current instanceof InteractiveCreationHandler) {
      return;
    }

    exitInstalledHandler();

    const handler = new InteractiveCreationHandler({
      id: "interactive-keypoint-creation-handler",
      onCreate: (worldPoint) => {
        const created = createKeypointRef.current({});

        if (!created) {
          return;
        }

        // Place the creation click's point, emitting: the point event is the
        // label's first commit (the bridge upserts), and on a frame field
        // `establishOnFirstPlacement` births the track off it.
        const overlay = scene.getOverlay(created.data._id as string);
        if (!(overlay instanceof KeypointOverlay)) {
          return;
        }

        const firstNodeId = overlay.getPointIdAt(0);
        if (firstNodeId) {
          // Skeleton field: the click places node 0 (hole → position)
          const rel = overlay.absolutePointToRelative(worldPoint);
          overlay.movePointById(firstNodeId, rel, true);
        } else {
          // Free-form field: the click appends the first point
          overlay.addPoint(worldPoint);
        }
        bumpGuidedEpoch();
      },
    });

    scene.enterInteractiveMode(handler);
    installedHandlerRef.current = handler;
  }, [
    bumpGuidedEpoch,
    // re-runs when Place forces a target on a fully-resolved label, which is
    // what installs the guided handler for the re-placement click
    currentForced,
    eventBus,
    exitInstalledHandler,
    getSkeleton,
    // re-runs when point geometry changes (placement, drag, undo/redo), so
    // an undo after auto-finish reinstalls the guided handler
    guidedEpoch,
    keypointModeActive,
    scene,
    // re-runs when the selected track's overlay mounts / unmounts
    sceneEpoch,
    selected,
    setForced,
    setSkips,
  ]);

  // Tear down on unmount (scene swap, modal close)
  useEffect(() => {
    return () => {
      exitInstalledHandler();
    };
  }, [exitInstalledHandler]);
};
