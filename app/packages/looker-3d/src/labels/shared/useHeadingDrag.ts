import { useThree, type ThreeEvent } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import type { CuboidResizeFace } from "../../annotation/cuboid-face-resize";
import { computeCuboidHeadingRelabel } from "../../annotation/cuboid-heading-relabel";
import {
  hoveredHeadingTargetFaceAtom,
  isCurrentlyTransformingAtom,
} from "../../state";
import type { HoveredLabelSource } from "../../types";
import { toNDC, toNDCForElement } from "../../utils";
import {
  getHeadingFaceDots,
  pickNearestHeadingFace,
} from "./heading-arrow-geometry";

type PointerCaptureTarget = EventTarget & {
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
};

interface HeadingDragState {
  /**
   * Dimensions and orientation captured at drag start, so the relabel is
   * computed against a stable frame even if the box re-renders mid-drag.
   */
  initialDimensions: THREE.Vector3Tuple;
  orientation: THREE.Quaternion;
  /**
   * Face the heading would snap to right now. Kept on the ref (not just the
   * shared atom that drives the highlight) so {@link finishDrag} stays
   * referentially stable — otherwise the window-listener effect below would tear
   * down and re-run on every pointer move, committing the relabel mid-drag.
   */
  targetFace: CuboidResizeFace | null;
  pointerId: number;
  pointerTarget: PointerCaptureTarget | null;
}

export interface UseHeadingDragOptions {
  labelId: string;
  /** Which panel owns the interaction, so hover state can't be cross-cleared. */
  hoverSource: HoveredLabelSource;
  /** Whether the arrow can be grabbed at all right now. */
  enabled: boolean;
  dimensions: THREE.Vector3Tuple;
  orientation: THREE.Quaternion;
  upVector?: THREE.Vector3 | null;
  /** The cuboid's content group, for its world transform. */
  contentRef: RefObject<THREE.Group | null>;
  /**
   * The DOM element backing this panel. Each panel is a drei `<View>` sharing
   * one canvas, so pointer-to-NDC conversion must use the panel's own rect.
   */
  panelElementRef: RefObject<HTMLElement | null>;
  onDragStart: () => void;
  onCommit: (
    baseDimensions: THREE.Vector3Tuple,
    nextDimensions: THREE.Vector3Tuple,
    nextQuaternion: THREE.Vector4Tuple,
  ) => void;
  onCancel: () => void;
  /** Lets the caller drop competing hover state when the arrow is entered. */
  onArrowEnter?: () => void;
  /** Set on grab so the caller can swallow the click that follows a drag. */
  suppressNextClickRef?: MutableRefObject<boolean>;
}

export interface UseHeadingDragResult {
  isHovered: boolean;
  isDragging: boolean;
  /** Hovered or dragging — the arrow should read as live either way. */
  isActive: boolean;
  /** Face the heading would snap to on release; null unless dragging. */
  targetFace: CuboidResizeFace | null;
  handlers: {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
    onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
    onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
    onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  };
}

/**
 * Grab-and-drop lifecycle for the cuboid heading arrow: press the arrow, drag
 * toward the face you want the heading on, release to commit.
 *
 * The target face is resolved by projecting each face's dot and taking the one
 * nearest the cursor in screen space. Resolving it from a 3D drag direction on a
 * view-perpendicular plane can't express a direction along the view axis, which
 * left both camera-axis faces unreachable.
 *
 * Nothing is written until release — the drag only moves a preview — so the
 * relabel lands as a single undoable commit.
 */
export function useHeadingDrag({
  labelId,
  hoverSource,
  enabled,
  dimensions,
  orientation,
  upVector,
  contentRef,
  panelElementRef,
  onDragStart,
  onCommit,
  onCancel,
  onArrowEnter,
  suppressNextClickRef,
}: UseHeadingDragOptions): UseHeadingDragResult {
  const { camera, gl } = useThree();
  const setIsCurrentlyTransforming = useSetRecoilState(
    isCurrentlyTransformingAtom,
  );
  const targetFaceState = useRecoilValue(hoveredHeadingTargetFaceAtom);
  const setTargetFaceState = useSetRecoilState(hoveredHeadingTargetFaceAtom);

  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<HeadingDragState | null>(null);
  const isClaimingControlsRef = useRef(false);

  // The candidate face is shared across panels so the highlight shows wherever
  // this label is drawn, not just in the panel under the cursor.
  const targetFace =
    targetFaceState?.labelId === labelId ? targetFaceState.face : null;

  const setTargetFace = useCallback(
    (face: CuboidResizeFace | null) => {
      setTargetFaceState((prev) => {
        if (face) {
          return { labelId, face, source: hoverSource };
        }
        // Only clear if this exact (label, panel) owns it, so a pointer-out
        // elsewhere can't wipe another panel's state.
        return prev?.labelId === labelId && prev?.source === hoverSource
          ? null
          : prev;
      });
    },
    [labelId, hoverSource, setTargetFaceState],
  );

  const isActive = isHovered || isDragging;

  // This effect claims the global "currently transforming" flag while the arrow
  // is live, so orbit and gizmo controls stand down for the gesture, and
  // releases it on teardown (including unmount).
  useEffect(() => {
    if (!enabled || !isActive) {
      return undefined;
    }

    isClaimingControlsRef.current = true;
    setIsCurrentlyTransforming(true);

    return () => {
      if (isClaimingControlsRef.current) {
        isClaimingControlsRef.current = false;
        setIsCurrentlyTransforming(false);
      }
    };
  }, [enabled, isActive, setIsCurrentlyTransforming]);

  const beginDrag = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!enabled || !contentRef.current) {
        return;
      }

      const pointerTarget = e.nativeEvent.target as PointerCaptureTarget | null;

      pointerTarget?.setPointerCapture?.(e.nativeEvent.pointerId);
      dragRef.current = {
        initialDimensions: [...dimensions] as THREE.Vector3Tuple,
        orientation: orientation.clone().normalize(),
        targetFace: null,
        pointerId: e.nativeEvent.pointerId,
        pointerTarget,
      };

      if (suppressNextClickRef) {
        suppressNextClickRef.current = true;
      }

      setIsDragging(true);
      setIsCurrentlyTransforming(true);
      onDragStart();

      e.stopPropagation();
      e.nativeEvent.preventDefault();
    },
    [
      enabled,
      contentRef,
      dimensions,
      orientation,
      onDragStart,
      setIsCurrentlyTransforming,
      suppressNextClickRef,
    ],
  );

  const updateFromPointer = useCallback(
    (event: PointerEvent) => {
      const dragState = dragRef.current;
      const content = contentRef.current;

      if (!dragState || !content) {
        return;
      }

      const panelElement = panelElementRef.current;
      const cursor = panelElement
        ? toNDCForElement(event, panelElement)
        : toNDC(event, gl.domElement);

      const projected = getHeadingFaceDots(dragState.initialDimensions).map(
        ({ face, position }) => {
          const world = new THREE.Vector3(...position).applyMatrix4(
            content.matrixWorld,
          );
          const cameraDistance = world.distanceTo(camera.position);
          const ndc = world.project(camera);
          return { face, x: ndc.x, y: ndc.y, cameraDistance };
        },
      );

      const nextFace = pickNearestHeadingFace(projected, cursor);

      dragState.targetFace = nextFace;
      setTargetFace(nextFace);
    },
    [camera, gl, contentRef, panelElementRef, setTargetFace],
  );

  const finishDrag = useCallback(() => {
    const dragState = dragRef.current;

    if (!dragState) {
      return;
    }

    if (
      dragState.pointerTarget?.hasPointerCapture?.(dragState.pointerId) === true
    ) {
      dragState.pointerTarget.releasePointerCapture?.(dragState.pointerId);
    }

    // Null when the drop lands back on the current heading face — nothing to
    // commit, so end the drag without writing an empty undo entry.
    const relabel = dragState.targetFace
      ? computeCuboidHeadingRelabel({
          dimensions: dragState.initialDimensions,
          quaternion: dragState.orientation,
          targetFace: dragState.targetFace,
          upVector,
        })
      : null;

    if (relabel) {
      onCommit(
        dragState.initialDimensions,
        relabel.dimensions,
        relabel.quaternion,
      );
    } else {
      onCancel();
    }

    dragRef.current = null;
    isClaimingControlsRef.current = false;
    setIsDragging(false);
    setTargetFace(null);
    setIsCurrentlyTransforming(false);
  }, [onCancel, onCommit, setTargetFace, setIsCurrentlyTransforming, upVector]);

  // The window listeners are wired through refs so the effect below can depend
  // on `isDragging` alone. Depending on the callbacks directly would mean any
  // one of their own dependencies changing mid-gesture re-runs the effect, and
  // its cleanup commits — ending the drag on a stray re-render. Keeping the
  // subscription keyed only to the gesture makes that impossible.
  const updateFromPointerRef = useRef(updateFromPointer);
  updateFromPointerRef.current = updateFromPointer;
  const finishDragRef = useRef(finishDrag);
  finishDragRef.current = finishDrag;

  // This effect drives an in-progress drag from window pointer events (so it
  // keeps tracking when the pointer leaves the canvas) and commits on release.
  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const handleMove = (event: PointerEvent) =>
      updateFromPointerRef.current(event);
    const handleEnd = () => finishDragRef.current();

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      // Unmounting or otherwise leaving the gesture still settles it.
      finishDragRef.current();
    };
  }, [isDragging]);

  // This effect drops hover/target state once the arrow is no longer editable
  // and no drag is in progress.
  useEffect(() => {
    if (!enabled && !isDragging) {
      setIsHovered(false);
      setTargetFace(null);
    }
  }, [enabled, isDragging, setTargetFace]);

  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setIsHovered(true);
      onArrowEnter?.();
    },
    [onArrowEnter],
  );

  const onPointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();

    // Read off the ref rather than the `isDragging` state so this callback stays
    // stable: a drag swings the pointer well clear of the arrow, and dropping
    // the hover mid-drag would revoke the grab.
    if (!dragRef.current) {
      setIsHovered(false);
    }
  }, []);

  // Swallowing pointer-move over the arrow keeps the box mesh underneath from
  // re-arming its own hover affordances while the cursor is on the arrow.
  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
  }, []);

  return {
    isHovered,
    isDragging,
    isActive,
    targetFace,
    handlers: {
      onPointerDown: beginDrag,
      onPointerOver,
      onPointerOut,
      onPointerMove,
    },
  };
}
