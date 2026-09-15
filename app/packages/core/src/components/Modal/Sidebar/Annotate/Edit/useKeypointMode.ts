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

/** Frame-level field paths (`frames.<field>`) — i.e. video. */
const FRAMES_PREFIX = "frames.";

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

  const activateKeypointMode = useCallback(
    () => setKeypointModeActive(true),
    [setKeypointModeActive],
  );

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

  const targetIndex = overlay
    ? computeTargetIndex(overlay, nodeCount, skipped)
    : null;

  /**
   * Skip the current target node: it stays a `[NaN, NaN]` hole and the guided
   * cursor moves on. When this resolves the last node, guided placement is
   * complete and the interactive handler is released (the overlay stays
   * selected for editing).
   */
  const skip = useCallback(() => {
    if (!overlay || targetIndex === null) return;

    const nextSkipped = [...skipped, targetIndex];
    setSkips({ overlayId: overlay.id, skipped: nextSkipped });

    if (computeTargetIndex(overlay, nodeCount, nextSkipped) === null) {
      scene?.exitInteractiveMode();
    }
  }, [nodeCount, overlay, scene, setSkips, skipped, targetIndex]);

  return {
    /** Node labels, when the skeleton defines them. */
    nodeLabels: skeleton?.labels ?? null,
    nodeCount,
    /** Live relative points — `[NaN, NaN]` entries are unplaced holes. */
    points: overlay?.getRelativePoints() ?? null,
    targetIndex,
    skipped,
    skip,
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
  const getSkeleton = useGetKeypointSkeleton();
  const { scene } = useLighter();
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

  // Selection drives the mode: selecting a 2D keypoint activates it,
  // switching to a different non-keypoint label exits it, deselecting leaves
  // it armed (mirrors polyline mode).
  const prevSelectedRef = useRef(selected);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selected;

    const isKeypoint2d = is2dKeypointSelected(selected);
    const wasKeypoint2d = is2dKeypointSelected(prev);

    if (isKeypoint2d) {
      setKeypointModeActive(true);
    } else if (wasKeypoint2d && selected?.label) {
      setKeypointModeActive(false);
    }

    // Selection changed to a different overlay: stale skip state never
    // carries over.
    if (selected?.overlay?.id && prev?.overlay?.id !== selected.overlay.id) {
      setSkips(null);
    }
  }, [selected, setKeypointModeActive, setSkips]);

  // Stable ref so the creation handler's `onCreate` always sees the latest
  // create function without swapping the installed handler.
  const createKeypoint = useCallback(
    (options?: CreateOptions) => createNew(KEYPOINT, options),
    [createNew],
  );
  const createKeypointRef = useRef(createKeypoint);
  createKeypointRef.current = createKeypoint;

  // The guided handler resolves its target through this ref so skip updates
  // take effect without reinstalling the handler.
  const currentSkips = useAtomValue(guidedSkipsAtom);
  const currentSkipsRef = useRef(currentSkips);
  currentSkipsRef.current = currentSkips;

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
          return computeTargetIndex(targetOverlay, nodeCount, skipped);
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
            bumpGuidedEpoch();
            // Auto-finish: release the handler once every node is resolved;
            // the overlay stays selected for editing.
            if (getTarget() === null) {
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
        const rel = scene.absolutePointToRelative(worldPoint);
        const created = createKeypointRef.current({ origin: [rel.x, rel.y] });

        // Frame-level fields (video) must announce the drawn label so the
        // video surface establishes the track — same dance as the polyline
        // creation flow (see usePolylineModeInstaller for the reasoning).
        if (created?.path?.startsWith(FRAMES_PREFIX)) {
          const bounds = { x: 0, y: 0, width: 0, height: 0 };

          eventBus.dispatch("lighter:overlay-establish", {
            id: handler.id,
            overlayId: created.data._id as string,
            handler,
            startBounds: bounds,
            startPosition: { x: bounds.x, y: bounds.y },
            bounds,
          });
        }
      },
    });

    scene.enterInteractiveMode(handler);
    installedHandlerRef.current = handler;
  }, [
    bumpGuidedEpoch,
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
  ]);

  // Tear down on unmount (scene swap, modal close)
  useEffect(() => {
    return () => {
      exitInstalledHandler();
    };
  }, [exitInstalledHandler]);
};
