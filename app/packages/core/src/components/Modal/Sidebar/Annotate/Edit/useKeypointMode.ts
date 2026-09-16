import { CommandContextManager } from "@fiftyone/commands";
import {
  GuidedKeypointHandler,
  InteractiveCreationHandler,
  InteractiveKeypointHandler,
  KeypointOverlay,
  KeypointPointHitAction,
  type KeypointPointHitContext,
  MoveKeypointPointCommand,
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
import {
  isKeypointDraftFinalized,
  markKeypointDraftFinalized,
} from "./keypointDraftState";
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
   * Creation is ATOMIC: the draft places its nodes silently and persists
   * once, when every node is placed or explicitly skipped (the installer's
   * completion watcher dispatches the finalize, which on video also creates
   * the track). Bailing at any point — mode exit, sample switch, scrub,
   * modal close — discards the draft; nothing partial ever persists.
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
  const getSkeleton = useGetKeypointSkeleton();
  const [skips, setSkips] = useAtom(guidedSkipsAtom);
  const [forced, setForced] = useAtom(forcedTargetAtom);
  // subscribe: recompute on every geometry change
  useAtomValue(guidedEpochAtom);
  const { scene } = useLighter();

  const overlay = is2dKeypointSelected(selected)
    ? (selected?.overlay as KeypointOverlay)
    : null;
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
    if (!overlay || targetIndex === null) return;

    const nextSkipped = skipped.includes(targetIndex)
      ? skipped
      : [...skipped, targetIndex];
    setSkips({ overlayId: overlay.id, skipped: nextSkipped });
    // Skipping a Place-forced node cancels the force
    if (forcedIndex === targetIndex) {
      setForced(null);
    }

    if (computeTargetIndex(overlay, nodeCount, nextSkipped) === null) {
      scene?.exitInteractiveMode();
    }
  }, [
    forcedIndex,
    nodeCount,
    overlay,
    scene,
    setForced,
    setSkips,
    skipped,
    targetIndex,
  ]);

  const bumpGuidedEpoch = useSetAtom(guidedEpochAtom);

  /**
   * Clear a placed node back to a `[NaN, NaN]` hole — the occlusion control.
   * A node is never deleted (its index is its identity), only placed or a
   * hole, so "occluded here" = clear it. On a committed video track this is
   * an ordinary edit: the clear commits, promotes the current frame to a
   * keyframe, and the bracketing segments re-lerp — with the hole rule
   * (either endpoint a hole → the span is a hole), the node vanishes from
   * this keyframe until the next keyframe that places it again. On a
   * creation draft the clear is silent and local, like placement.
   */
  const clearNode = useCallback(
    (index: number) => {
      if (!overlay) return;

      const pointId = overlay.getPointIdAt(index);
      const from = pointId ? overlay.getPointById(pointId)?.position : null;
      if (
        !pointId ||
        !from ||
        !Number.isFinite(from[0]) ||
        !Number.isFinite(from[1])
      ) {
        return;
      }

      const emit = !(selected?.isNew && !isKeypointDraftFinalized(overlay.id));
      const hole: [number, number] = [NaN, NaN];

      overlay.movePointById(pointId, hole, emit);

      const command = new MoveKeypointPointCommand(
        overlay,
        pointId,
        from,
        hole,
        emit,
      );
      CommandContextManager.instance().getActiveContext().pushUndoable(command);

      // Clearing IS skipping: the node is deliberately a hole now (occluded),
      // so the guided cursor passes it rather than immediately re-arming its
      // placement. Re-placing is explicit — the row's Place button.
      if (!skipped.includes(index)) {
        setSkips({ overlayId: overlay.id, skipped: [...skipped, index] });
      }
      if (forcedIndex === index) {
        setForced(null);
      }

      bumpGuidedEpoch((n) => n + 1);
    },
    [
      bumpGuidedEpoch,
      forcedIndex,
      overlay,
      selected,
      setForced,
      setSkips,
      skipped,
    ],
  );

  /**
   * Aim the next click at a specific hole — the checklist's Place button.
   * Un-skips the node and force-targets it, so re-placing an occluded node
   * (a hand coming back into frame) doesn't wait its strict-order turn.
   */
  const placeNode = useCallback(
    (index: number) => {
      if (!overlay) return;

      if (skipped.includes(index)) {
        setSkips({
          overlayId: overlay.id,
          skipped: skipped.filter((i) => i !== index),
        });
      }
      setForced({ overlayId: overlay.id, index });
    },
    [overlay, setForced, setSkips, skipped],
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
      overlay?.selectPoint(index);
    },
    [overlay],
  );

  return {
    /** Node labels, when the skeleton defines them. */
    nodeLabels: skeleton?.labels ?? null,
    nodeCount,
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
     * True while the label is an unfinalized creation draft — the per-node
     * inspector hides during placement (attributes come after geometry).
     */
    isDraft:
      !!selected?.isNew && !!overlay && !isKeypointDraftFinalized(overlay.id),
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
  const { selected, createNew } = useAnnotationContext();
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

  // Any established overlay counts as finalized: free-form drafts finalize
  // through their handler's double-click establish, which doesn't go through
  // `finalizeDraft` below. Non-keypoint overlay ids in the set are inert.
  useLighterEvent(
    "lighter:overlay-establish",
    useCallback((event: { overlayId: string }) => {
      markKeypointDraftFinalized(event.overlayId);
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
  // switch to another label therefore exits the mode, and an unfinalized
  // draft left behind by either is discarded (atomic creation: a bail never
  // persists, and it should not linger in the scene either).
  const prevSelectedRef = useRef(selected);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selected;

    const isKeypoint2d = is2dKeypointSelected(selected);
    const wasKeypoint2d = is2dKeypointSelected(prev);

    if (isKeypoint2d) {
      setKeypointModeActive(true);
    } else if (wasKeypoint2d) {
      setKeypointModeActive(false);

      // Discard the abandoned draft's scene overlay (deselect paths bypass
      // useExit's cleanup)
      const prevId = prev?.overlay?.id;
      if (
        prev?.isNew &&
        prevId &&
        !isKeypointDraftFinalized(prevId) &&
        scene?.getOverlay(prevId)
      ) {
        removeOverlay(prevId, true);
      }
    }

    // Selection changed to a different overlay: stale skip / Place / node
    // sub-selection state never carries over.
    if (prev?.overlay?.id !== selected?.overlay?.id) {
      setSkips(null);
      setForced(null);
      setSelectedNode(null);
    }
  }, [
    removeOverlay,
    scene,
    selected,
    setForced,
    setKeypointModeActive,
    setSelectedNode,
    setSkips,
  ]);

  // The edit form's Field picker is how a different skeleton is chosen, so a
  // field swap on a creation draft RESTARTS it for the new field's skeleton:
  // hole count and edges follow the field, and any placed nodes are dropped —
  // a node's index is bound to the old skeleton's semantics (node 3 of a face
  // is not node 3 of a body), so carrying placements across topologies would
  // be silent corruption. Committed labels never take this path (their swap
  // moves engine rows; see Field.tsx).
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
      !is2dKeypointSelected(selected) ||
      !selected?.isNew ||
      isKeypointDraftFinalized(selected.overlay?.id ?? "")
    ) {
      return;
    }

    const overlay = scene.getOverlay(selected.overlay?.id ?? "");
    if (!(overlay instanceof KeypointOverlay)) {
      return;
    }

    const skeleton = getSkeleton(field);
    const nodeCount = skeletonNodeCount(skeleton);
    overlay.setConnections(skeleton?.edges ?? []);
    overlay.applyLabel({
      ...overlay.label,
      points: Array.from({ length: nodeCount }, () => [NaN, NaN]),
    });
    setSkips(null);
    bumpGuidedEpoch();
  }, [bumpGuidedEpoch, getSkeleton, scene, selected, setSkips]);

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

  // Keypoint creation is ATOMIC: draft placements are silent (no commits),
  // and the one persistence event is this finalize — dispatched when every
  // node is resolved (placed or explicitly skipped) with at least one placed.
  // The establish event both commits the label and, on video, creates its
  // track; a draft abandoned before finalize was never persisted, so every
  // bail path (mode exit, sample switch, scrub, modal close) is a discard.
  const finalizeDraft = useCallback(
    (overlay: KeypointOverlay, data: Record<string, unknown> | undefined) => {
      if (isKeypointDraftFinalized(overlay.id)) {
        return;
      }
      markKeypointDraftFinalized(overlay.id);

      // Fold the sidebar draft's fields (class, attributes picked mid-draft)
      // into the overlay label the commit extraction reads, keeping the live
      // geometry authoritative.
      overlay.applyLabel({
        ...overlay.label,
        ...(data ?? {}),
        points: overlay.getRelativePoints(),
      } as typeof overlay.label);

      // The consumers read geometry from the overlay / engine anchor, not
      // this payload — a zero rect satisfies the event shape
      const bounds = { x: 0, y: 0, width: 0, height: 0 };
      eventBus.dispatch("lighter:overlay-establish", {
        id: "guided-keypoint-finalize",
        overlayId: overlay.id,
        handler: installedHandlerRef.current ?? undefined,
        startBounds: bounds,
        startPosition: { x: bounds.x, y: bounds.y },
        bounds,
      });
    },
    [eventBus],
  );

  // Completion watcher: finalize the selected draft once its guided sequence
  // resolves. Runs on geometry changes (guidedEpoch) and skip changes.
  useEffect(() => {
    if (!scene || !is2dKeypointSelected(selected) || !selected?.isNew) {
      return;
    }

    const overlay = scene.getOverlay(selected.overlay?.id ?? "");
    if (
      !(overlay instanceof KeypointOverlay) ||
      isKeypointDraftFinalized(overlay.id)
    ) {
      return;
    }

    const field = selected.field ?? null;
    const nodeCount = skeletonNodeCount(field ? getSkeleton(field) : null);
    if (!nodeCount) {
      // Free-form drafts finalize on double-click (the handler's establish)
      return;
    }

    const skipped =
      currentSkips?.overlayId === overlay.id ? currentSkips.skipped : [];
    const forcedIndex =
      currentForced?.overlayId === overlay.id ? currentForced.index : null;
    // A Place-forced hole keeps the draft open until it's actually placed
    const complete =
      resolveTargetIndex(overlay, nodeCount, skipped, forcedIndex) === null;
    const anyPlaced = overlay
      .getRelativePoints()
      .some((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));

    if (complete && anyPlaced) {
      finalizeDraft(
        overlay,
        selected.data as Record<string, unknown> | undefined,
      );
    }
  }, [
    currentForced,
    currentSkips,
    finalizeDraft,
    getSkeleton,
    guidedEpoch,
    scene,
    selected,
  ]);

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
          onPlaced: () => {
            // A placement satisfies any Place force (the forced node was the
            // target, or it got placed some other way — either way, resume
            // strict order)
            setForced(null);
            bumpGuidedEpoch();
            // Auto-finish: release the handler once every node is resolved;
            // the overlay stays selected for editing. (The completion
            // watcher finalizes the draft.)
            if (getTarget() === null) {
              exitInstalledHandler();
            }
          },
          // Draft placements are silent (atomic creation); resuming holes on
          // an already-committed label emits per placement (edits).
          silent:
            !!selected?.isNew && !isKeypointDraftFinalized(targetOverlay.id),
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
        // Draft placements are silent (atomic creation) — the double-click
        // finish is free-form's finalize; edits on committed labels emit.
        !!selected?.isNew && !isKeypointDraftFinalized(targetOverlay.id),
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

        // Place the creation click's point — SILENTLY: creation is atomic,
        // so nothing commits until the draft completes (the completion
        // watcher finalizes skeleton drafts; free-form finalizes on
        // double-click).
        const overlay = scene.getOverlay(created.data._id as string);
        if (!(overlay instanceof KeypointOverlay)) {
          return;
        }

        const firstNodeId = overlay.getPointIdAt(0);
        if (firstNodeId) {
          // Skeleton draft: the click places node 0 (hole → position)
          const rel = overlay.absolutePointToRelative(worldPoint);
          overlay.movePointById(firstNodeId, rel, false);
        } else {
          // Free-form draft: the click appends the first point
          overlay.addPoint(worldPoint, { silent: true });
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
  ]);

  // Tear down on unmount (scene swap, modal close)
  useEffect(() => {
    return () => {
      exitInstalledHandler();
    };
  }, [exitInstalledHandler]);
};
