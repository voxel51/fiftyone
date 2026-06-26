import * as fos from "@fiftyone/state";
import { Line, useCursor } from "@react-three/drei";
import { extend, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import {
  CUBOID_RESIZE_FACES,
  computeCuboidFaceResizeDelta,
  getCuboidFaceResizeDragPlaneNormal,
  getCuboidResizeDimensionMagnitudes,
  getCuboidResizeFaceAxis,
  getCuboidResizeFaceFromNormal,
  getCuboidResizeFaceWorldNormal,
  getCuboidResizeQuaternion,
  isValidCuboidResizeDimensions,
  type CuboidResizeFace,
} from "../annotation/cuboid-face-resize";
import { useTransientCuboid } from "../annotation/store";
import { useCuboidAnnotation } from "../annotation/useCuboidAnnotation";
import { FO_USER_DATA, PANEL_ID_MAIN } from "../constants";
import { useFo3dContext } from "../fo3d/context";
import {
  currentArchetypeSelectedForTransformAtom,
  hoveredLabelAtom,
  isActivelySegmentingSelector,
  isCreatingCuboidPointerDownAtom,
  isCurrentlyTransformingAtom,
  selectedLabelForAnnotationAtom,
  transformModeAtom,
} from "../state";
import { useSetCurrent3dAnnotationMode } from "../state/accessors";
import {
  getComplementaryColor,
  getCuboidForwardFaceBasePoint,
  getPlaneIntersection,
  toNDC,
} from "../utils";
import type { HoveredLabelSource } from "../types";
import type { OverlayProps } from "./shared";
import { useEventHandlers, useHoverState, useLabelColor } from "./shared/hooks";
import { Transformable } from "./shared/TransformControls";

extend({ LineSegments2, LineMaterial, LineSegmentsGeometry });

const FACE_RESIZE_EDGE_COLOR = "#ff2f2f";
const FACE_RESIZE_HIGHLIGHT_OPACITY = 0.78;
const FACE_RESIZE_HIGHLIGHT_OFFSET = 1e-4;
const FACE_RESIZE_EDGE_LINE_WIDTH = 2;
const ORIENTATION_MARKER_LINE_WIDTH = 3;
const ORIENTATION_MARKER_OPACITY = 0.95;
const ORIENTATION_MARKER_MIN_HEAD_LENGTH = 0.08;
const ORIENTATION_MARKER_MIN_HEAD_RADIUS = 0.03;
const ORIENTATION_MARKER_HEAD_SEGMENTS = 24;
const ORIENTATION_MARKER_HEAD_LENGTH_RATIO = 0.18;
const ORIENTATION_MARKER_MIN_CROSS_SECTION_RATIO = 0.1;
const ORIENTATION_MARKER_HEAD_RADIUS_RATIO = 0.12;
const ORIENTATION_MARKER_HEAD_RADIUS_LENGTH_CAP = 0.45;

type PointerCaptureTarget = EventTarget & {
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
};

interface FaceResizeDragState {
  face: CuboidResizeFace;
  initialDimensions: THREE.Vector3Tuple;
  orientationQuaternion: THREE.Vector4Tuple;
  faceWorldNormal: THREE.Vector3;
  dragPlane: THREE.Plane;
  startPoint: THREE.Vector3;
  pointerId: number;
  pointerTarget: PointerCaptureTarget | null;
}

const getFaceResizeHighlightProps = (
  face: CuboidResizeFace,
  dimensions: THREE.Vector3Tuple,
) => {
  const dimensionMagnitudes = getCuboidResizeDimensionMagnitudes(dimensions);
  const { axis, sign } = getCuboidResizeFaceAxis(face);
  const position: THREE.Vector3Tuple = [0, 0, 0];
  position[axis] =
    sign * (dimensionMagnitudes[axis] / 2 + FACE_RESIZE_HIGHLIGHT_OFFSET);

  if (axis === 0) {
    return {
      position,
      rotation: [
        0,
        sign > 0 ? Math.PI / 2 : -Math.PI / 2,
        0,
      ] as THREE.Vector3Tuple,
      args: [dimensionMagnitudes[2], dimensionMagnitudes[1]] as [
        number,
        number,
      ],
    };
  }

  if (axis === 1) {
    return {
      position,
      rotation: [
        sign > 0 ? -Math.PI / 2 : Math.PI / 2,
        0,
        0,
      ] as THREE.Vector3Tuple,
      args: [dimensionMagnitudes[0], dimensionMagnitudes[2]] as [
        number,
        number,
      ],
    };
  }

  return {
    position,
    rotation: [0, sign > 0 ? 0 : Math.PI, 0] as THREE.Vector3Tuple,
    args: [dimensionMagnitudes[0], dimensionMagnitudes[1]] as [number, number],
  };
};

const getFaceResizeEdgePoints = ([width, height]: [number, number]) =>
  [
    [-width / 2, -height / 2, 0],
    [width / 2, -height / 2, 0],
    [width / 2, height / 2, 0],
    [-width / 2, height / 2, 0],
    [-width / 2, -height / 2, 0],
  ] as THREE.Vector3Tuple[];

const canArmFaceResizeHover = (e: ThreeEvent<PointerEvent>) =>
  e.nativeEvent.buttons === 0;

export interface CuboidProps extends OverlayProps {
  location: THREE.Vector3Tuple;
  dimensions: THREE.Vector3Tuple;
  itemRotation: THREE.Vector3Tuple;
  lineWidth?: number;
  enableFaceResize?: boolean;
  hoverSource?: HoveredLabelSource;
  showOrientation?: boolean;
}

interface CuboidOrientationMarkerProps {
  dimensions: THREE.Vector3Tuple;
  color: string;
  orientation: THREE.Quaternion;
  upVector?: THREE.Vector3 | null;
}

const getFiniteMagnitude = (value: number) =>
  Number.isFinite(value) ? Math.abs(value) : 0;

const getCuboidOrientationMarkerProps = (
  dimensions: THREE.Vector3Tuple,
  orientation: THREE.Quaternion,
  upVector?: THREE.Vector3 | null,
): {
  headLength: number;
  headPosition: THREE.Vector3Tuple;
  headRadius: number;
  shaftStart: THREE.Vector3Tuple;
  shaftEnd: THREE.Vector3Tuple;
} | null => {
  const length = getFiniteMagnitude(dimensions[0]);

  if (length <= 0) {
    return null;
  }

  const basePoint = getCuboidForwardFaceBasePoint({
    dimensions,
    orientation,
    upVector,
  });

  if (!basePoint) {
    return null;
  }

  const localYExtent = getFiniteMagnitude(dimensions[1]);
  const localZExtent = getFiniteMagnitude(dimensions[2]);
  const faceX = length / 2;
  const extensionLength = length / 2;
  const headLength = Math.max(
    Math.min(length * ORIENTATION_MARKER_HEAD_LENGTH_RATIO, extensionLength),
    ORIENTATION_MARKER_MIN_HEAD_LENGTH,
  );
  const crossSection = Math.max(
    Math.min(localYExtent, localZExtent),
    length * ORIENTATION_MARKER_MIN_CROSS_SECTION_RATIO,
  );
  const headRadius = Math.max(
    Math.min(
      crossSection * ORIENTATION_MARKER_HEAD_RADIUS_RATIO,
      headLength * ORIENTATION_MARKER_HEAD_RADIUS_LENGTH_CAP,
    ),
    ORIENTATION_MARKER_MIN_HEAD_RADIUS,
  );
  const shaftEndX = faceX + extensionLength;

  return {
    headLength,
    headPosition: [shaftEndX + headLength / 2, basePoint.y, basePoint.z],
    headRadius,
    shaftStart: basePoint.toArray() as THREE.Vector3Tuple,
    shaftEnd: [shaftEndX, basePoint.y, basePoint.z],
  };
};

const CuboidOrientationMarker = ({
  dimensions,
  color,
  orientation,
  upVector,
}: CuboidOrientationMarkerProps) => {
  const markerProps = getCuboidOrientationMarkerProps(
    dimensions,
    orientation,
    upVector,
  );

  if (!markerProps) {
    return null;
  }

  return (
    <group userData={{ [FO_USER_DATA.IS_HELPER]: true }} renderOrder={3}>
      <Line
        points={[markerProps.shaftStart, markerProps.shaftEnd]}
        color={color}
        lineWidth={ORIENTATION_MARKER_LINE_WIDTH}
        opacity={ORIENTATION_MARKER_OPACITY}
        transparent
        depthTest={false}
        raycast={() => null}
      />
      <mesh
        position={markerProps.headPosition}
        rotation={[0, 0, -Math.PI / 2]}
        renderOrder={3}
        raycast={() => null}
      >
        <coneGeometry
          args={[
            markerProps.headRadius,
            markerProps.headLength,
            ORIENTATION_MARKER_HEAD_SEGMENTS,
          ]}
        />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={ORIENTATION_MARKER_OPACITY}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export const Cuboid = ({
  dimensions,
  opacity,
  rotation,
  location,
  lineWidth,
  selected,
  onClick,
  label,
  color,
  useLegacyCoordinates,
  enableFaceResize = false,
  hoverSource = PANEL_ID_MAIN,
  showOrientation = false,
}: CuboidProps) => {
  useHoverState();
  const { camera, gl } = useThree();
  const { upVector } = useFo3dContext();
  const hoveredLabel = useRecoilValue(hoveredLabelAtom);
  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);
  const isActivelySegmenting = useRecoilValue(isActivelySegmentingSelector);
  const isCreatingCuboidPointerDown = useRecoilValue(
    isCreatingCuboidPointerDownAtom,
  );
  const isCurrentlyTransforming = useRecoilValue(isCurrentlyTransformingAtom);
  const setIsCurrentlyTransforming = useSetRecoilState(
    isCurrentlyTransformingAtom,
  );
  const [hoveredResizeFace, setHoveredResizeFace] =
    useState<CuboidResizeFace | null>(null);
  const [isFaceResizeDragging, setIsFaceResizeDragging] = useState(false);
  const faceResizeDragRef = useRef<FaceResizeDragState | null>(null);
  const isDisablingControlsForFaceResizeRef = useRef(false);
  const raycasterRef = useRef(new THREE.Raycaster());
  const suppressNextClickRef = useRef(false);

  const isHovered = hoveredLabel?.id === label._id;

  const isAnnotateMode = fos.useModalMode() === fos.ModalMode.ANNOTATE;
  const isSelectedForAnnotation =
    useRecoilValue(selectedLabelForAnnotationAtom)?._id === label._id;
  const setCurrent3dAnnotationMode = useSetCurrent3dAnnotationMode();
  const setCurrentArchetypeSelectedForTransform = useSetRecoilState(
    currentArchetypeSelectedForTransformAtom,
  );

  // This effect keeps the global 3D annotation mode set to "cuboid" while this
  // cuboid is the label selected for annotation.
  useEffect(() => {
    if (isSelectedForAnnotation) {
      setCurrent3dAnnotationMode("cuboid");
    }
  }, [isSelectedForAnnotation, setCurrent3dAnnotationMode]);

  const labelWoQuaternion = useMemo(() => {
    if (!label.quaternion) {
      return label;
    }
    const { quaternion, ...rest } = label;
    return rest;
  }, [label]);

  const { onPointerOver, onPointerOut, ...restEventHandlers } =
    useEventHandlers(labelWoQuaternion);

  const { strokeAndFillColor, isSimilarLabelHovered } = useLabelColor(
    { selected, color },
    isHovered,
    label,
    isSelectedForAnnotation,
  );

  const {
    transformControlsRef,
    contentRef,
    effectiveLocation,
    effectiveDimensions,
    effectiveRotation,
    effectiveQuaternion,
    handleTransformStart,
    handleTransformChange,
    handleTransformEnd,
    handleFaceResizeStart,
    handleFaceResizeChange,
    handleFaceResizeEnd,
  } = useCuboidAnnotation({
    label,
    location,
    dimensions,
    rotation,
    isAnnotateMode,
    isSelectedForAnnotation,
  });

  const setHoveredLabelFromPointer = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (hoverSource === PANEL_ID_MAIN && e.nativeEvent.buttons !== 0) {
        return false;
      }

      setHoveredLabel({ id: label._id, source: hoverSource });
      return true;
    },
    [hoverSource, label._id, setHoveredLabel],
  );

  const transformMode = useRecoilValue(transformModeAtom);

  // Transient state for live drag preview
  const transientState = useTransientCuboid(label._id);

  // Compute display dimensions: apply transient delta if present
  const displayDimensions = useMemo(() => {
    if (transientState?.dimensionsDelta) {
      return [
        effectiveDimensions[0] + transientState.dimensionsDelta[0],
        effectiveDimensions[1] + transientState.dimensionsDelta[1],
        effectiveDimensions[2] + transientState.dimensionsDelta[2],
      ] as THREE.Vector3Tuple;
    }
    return effectiveDimensions;
  }, [effectiveDimensions, transientState?.dimensionsDelta]);

  // Compute display position: apply transient delta if present
  const displayPosition = useMemo(() => {
    let [x, y, z] = effectiveLocation;

    // In legacy coordinate system, location was stored as the top-center of the cuboid
    // (half-height above the geometric center), so we adjust Y downward by half the height
    // to position the cuboid correctly. In the new coordinate system, location is stored
    // as the geometric center, matching Three.js BoxGeometry's center, so no adjustment is needed.
    if (useLegacyCoordinates) {
      y -= 0.5 * displayDimensions[1];
    }

    if (transientState?.positionDelta) {
      return [
        x + transientState.positionDelta[0],
        y + transientState.positionDelta[1],
        z + transientState.positionDelta[2],
      ] as THREE.Vector3Tuple;
    }
    return [x, y, z] as const;
  }, [
    effectiveLocation,
    displayDimensions,
    useLegacyCoordinates,
    transientState?.positionDelta,
  ]);

  // When quaternion is present (transient or working), use it directly to avoid euler conversion issues
  // (gimbal lock, precision loss). We convert to euler only on final save.
  // Priority: transientState.quaternionOverride > effectiveQuaternion (working) > euler fallback
  const combinedQuaternion = useMemo(() => {
    // During active rotation, prefer transient quaternion override
    if (transformMode === "rotate" && transientState?.quaternionOverride) {
      return new THREE.Quaternion(...transientState.quaternionOverride);
    }
    // Otherwise use effective (working) quaternion if available
    if (effectiveQuaternion) {
      return new THREE.Quaternion(...effectiveQuaternion);
    }
    return null;
  }, [
    transientState?.quaternionOverride,
    effectiveQuaternion,
    rotation,
    transformMode,
  ]);

  // Fallback to euler-based rotation when no quaternion available
  const fallbackEuler = useMemo(() => {
    if (combinedQuaternion) {
      return undefined;
    }
    return new THREE.Euler(...(effectiveRotation as THREE.Vector3Tuple));
  }, [combinedQuaternion, effectiveRotation]);

  const orientationQuaternion = useMemo(() => {
    if (combinedQuaternion) {
      return combinedQuaternion.clone();
    }

    return getCuboidResizeQuaternion({
      rotation: effectiveRotation as THREE.Vector3Tuple,
    });
  }, [combinedQuaternion, effectiveRotation]);

  const isFaceResizeControlActive =
    Boolean(hoveredResizeFace) || isFaceResizeDragging;
  const canFaceResize =
    enableFaceResize &&
    isAnnotateMode &&
    isSelectedForAnnotation &&
    transformMode === "scale" &&
    !isCreatingCuboidPointerDown &&
    !isActivelySegmenting &&
    isValidCuboidResizeDimensions(displayDimensions) &&
    (!isCurrentlyTransforming || isFaceResizeControlActive);

  useCursor(
    canFaceResize && isFaceResizeControlActive,
    isFaceResizeDragging ? "grabbing" : "grab",
    "auto",
  );

  // This effect claims the global "currently transforming" flag while a
  // face-resize hover/drag is active and releases it on teardown (including
  // unmount), so orbit/transform controls re-enable once resizing ends.
  useEffect(() => {
    if (!isFaceResizeControlActive) {
      return undefined;
    }

    isDisablingControlsForFaceResizeRef.current = true;
    setIsCurrentlyTransforming(true);

    return () => {
      if (isDisablingControlsForFaceResizeRef.current) {
        isDisablingControlsForFaceResizeRef.current = false;
        setIsCurrentlyTransforming(false);
      }
    };
  }, [isFaceResizeControlActive, setIsCurrentlyTransforming]);

  const getPointerDragPlaneIntersection = useCallback(
    (event: PointerEvent, plane: THREE.Plane) => {
      return getPlaneIntersection(
        raycasterRef.current,
        camera,
        toNDC(event, gl.domElement),
        plane,
      );
    },
    [camera, gl],
  );

  const beginFaceResize = useCallback(
    (e: ThreeEvent<PointerEvent>, face: CuboidResizeFace | null) => {
      if (!canFaceResize) {
        return;
      }

      if (!face) {
        return;
      }

      const orientation = orientationQuaternion.clone().normalize();
      const faceWorldNormal = getCuboidResizeFaceWorldNormal(face, orientation);
      const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
      const cameraUp = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(camera.quaternion)
        .normalize();
      const dragPlaneNormal = getCuboidFaceResizeDragPlaneNormal({
        faceWorldNormal,
        cameraDirection,
        cameraUp,
      });
      const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        dragPlaneNormal,
        e.point,
      );
      const startPoint =
        getPointerDragPlaneIntersection(e.nativeEvent, dragPlane) ??
        e.point.clone();
      const pointerTarget = e.nativeEvent.target as PointerCaptureTarget | null;

      pointerTarget?.setPointerCapture?.(e.nativeEvent.pointerId);
      faceResizeDragRef.current = {
        face,
        initialDimensions: [...effectiveDimensions] as THREE.Vector3Tuple,
        orientationQuaternion: orientation.toArray() as THREE.Vector4Tuple,
        faceWorldNormal,
        dragPlane,
        startPoint,
        pointerId: e.nativeEvent.pointerId,
        pointerTarget,
      };
      suppressNextClickRef.current = true;
      setHoveredResizeFace(face);
      setIsFaceResizeDragging(true);
      setIsCurrentlyTransforming(true);
      handleFaceResizeStart();

      e.stopPropagation();
      e.nativeEvent.preventDefault();
    },
    [
      camera,
      canFaceResize,
      effectiveDimensions,
      getPointerDragPlaneIntersection,
      handleFaceResizeStart,
      orientationQuaternion,
      setIsCurrentlyTransforming,
    ],
  );

  const handleFaceResizePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      restEventHandlers.onPointerMove?.(e);

      if (!canFaceResize || isFaceResizeDragging) {
        return;
      }

      if (!canArmFaceResizeHover(e)) {
        return;
      }

      setHoveredResizeFace(getCuboidResizeFaceFromNormal(e.face?.normal));
    },
    [canFaceResize, isFaceResizeDragging, restEventHandlers],
  );

  const handleFaceResizePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      beginFaceResize(e, getCuboidResizeFaceFromNormal(e.face?.normal));
    },
    [beginFaceResize],
  );

  const handleFaceResizeHandlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>, face: CuboidResizeFace) => {
      restEventHandlers.onPointerMove?.(e);

      if (!canFaceResize || isFaceResizeDragging) {
        return;
      }

      if (!canArmFaceResizeHover(e)) {
        return;
      }

      setHoveredResizeFace(face);
    },
    [canFaceResize, isFaceResizeDragging, restEventHandlers],
  );

  const handleFaceResizeHandlePointerOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();

      if (!isFaceResizeDragging) {
        setHoveredResizeFace(null);
      }

      setHoveredLabel(null);
      onPointerOut();
    },
    [isFaceResizeDragging, onPointerOut, setHoveredLabel],
  );

  const updateFaceResizeFromPointer = useCallback(
    (event: PointerEvent) => {
      const dragState = faceResizeDragRef.current;
      if (!dragState) {
        return;
      }

      const currentPoint = getPointerDragPlaneIntersection(
        event,
        dragState.dragPlane,
      );
      if (!currentPoint) {
        return;
      }

      const dragDistance = currentPoint
        .sub(dragState.startPoint)
        .dot(dragState.faceWorldNormal);
      const { dimensionsDelta, positionDelta } = computeCuboidFaceResizeDelta({
        face: dragState.face,
        dimensions: dragState.initialDimensions,
        dragDistance,
        quaternion: dragState.orientationQuaternion,
        useLegacyCoordinates,
      });

      handleFaceResizeChange({
        dimensionsDelta,
        positionDelta,
      });
    },
    [
      getPointerDragPlaneIntersection,
      handleFaceResizeChange,
      useLegacyCoordinates,
    ],
  );

  const finishFaceResize = useCallback(() => {
    const dragState = faceResizeDragRef.current;
    if (!dragState) {
      return;
    }

    if (
      dragState.pointerTarget?.hasPointerCapture?.(dragState.pointerId) === true
    ) {
      dragState.pointerTarget.releasePointerCapture?.(dragState.pointerId);
    }

    handleFaceResizeEnd();
    faceResizeDragRef.current = null;
    isDisablingControlsForFaceResizeRef.current = false;
    setIsFaceResizeDragging(false);
    setHoveredResizeFace(null);
    setIsCurrentlyTransforming(false);
  }, [handleFaceResizeEnd, setIsCurrentlyTransforming]);

  // This effect drives an in-progress face-resize drag from window pointer
  // events (so it keeps tracking even when the pointer leaves the canvas) and
  // removes the listeners when the drag ends.
  useEffect(() => {
    if (!isFaceResizeDragging) {
      return undefined;
    }

    window.addEventListener("pointermove", updateFaceResizeFromPointer);
    window.addEventListener("pointerup", finishFaceResize);
    window.addEventListener("pointercancel", finishFaceResize);

    return () => {
      window.removeEventListener("pointermove", updateFaceResizeFromPointer);
      window.removeEventListener("pointerup", finishFaceResize);
      window.removeEventListener("pointercancel", finishFaceResize);
    };
  }, [finishFaceResize, isFaceResizeDragging, updateFaceResizeFromPointer]);

  // This effect clears the hovered resize face once face-resizing is no longer
  // available and no drag is in progress.
  useEffect(() => {
    if (!canFaceResize && !isFaceResizeDragging) {
      setHoveredResizeFace(null);
    }
  }, [canFaceResize, isFaceResizeDragging]);

  const renderBoxGeometry = useMemo(
    () => displayDimensions && new THREE.BoxGeometry(...displayDimensions),
    [displayDimensions],
  );

  const renderEdgesGeometry = useMemo(
    () => new THREE.EdgesGeometry(renderBoxGeometry),
    [renderBoxGeometry],
  );
  const lineSegmentsGeometry = useMemo(
    () =>
      new LineSegmentsGeometry().fromLineSegments(
        new THREE.LineSegments(renderEdgesGeometry),
      ),
    [renderEdgesGeometry],
  );

  const complementaryColor = useMemo(
    () => getComplementaryColor(strokeAndFillColor),
    [strokeAndFillColor],
  );
  const shouldShowWireframe = isSelectedForAnnotation || isHovered;

  const material = useMemo(
    () =>
      new LineMaterial({
        opacity: opacity,
        transparent: opacity < 0.2,
        color: strokeAndFillColor,
        linewidth: lineWidth,
      }),
    [
      selected,
      lineWidth,
      opacity,
      isHovered,
      isSimilarLabelHovered,
      strokeAndFillColor,
    ],
  );

  // This effect cleans up geometries and material on unmount
  useEffect(() => {
    return () => {
      renderBoxGeometry.dispose();
      renderEdgesGeometry.dispose();
      lineSegmentsGeometry.dispose();
      material.dispose();
    };
  }, [renderBoxGeometry, renderEdgesGeometry, lineSegmentsGeometry, material]);

  if (!location || !dimensions) return null;

  const faceResizeHighlightProps =
    hoveredResizeFace && canFaceResize
      ? getFaceResizeHighlightProps(hoveredResizeFace, displayDimensions)
      : null;
  const faceResizeHandleProps = canFaceResize
    ? CUBOID_RESIZE_FACES.map((face) => ({
        face,
        ...getFaceResizeHighlightProps(face, displayDimensions),
      }))
    : [];

  /**
   * note: it's important to not set event handlers on the group,
   * because raycasting for line2 is unstable.
   * so we skip the border and only use the volume instead, which is more stable.
   *
   * we're using line2 over core line because line2 allows configurable line width
   */
  const content = (
    <group
      // By default, quaternion is preferred automatically over euler
      ref={contentRef}
      userData={{ [FO_USER_DATA.LABEL_ID]: label._id }}
      rotation={combinedQuaternion ? undefined : (fallbackEuler ?? undefined)}
      quaternion={combinedQuaternion ?? undefined}
      position={displayPosition}
    >
      {/* Outline */}
      {/* @ts-ignore */}
      <lineSegments2 geometry={lineSegmentsGeometry} material={material} />

      {/* Clickable volume */}
      <group
        onClick={(e) => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            e.stopPropagation();
            return;
          }

          if (isSelectedForAnnotation) {
            setCurrentArchetypeSelectedForTransform("cuboid");
          }

          onClick(e);
        }}
        onPointerOver={(e) => {
          if (!setHoveredLabelFromPointer(e)) {
            return;
          }

          onPointerOver();
        }}
        onPointerOut={() => {
          setHoveredLabel(null);
          if (!isFaceResizeDragging) {
            setHoveredResizeFace(null);
          }
          onPointerOut();
        }}
        onPointerMissed={restEventHandlers.onPointerMissed}
      >
        <mesh
          onPointerMove={handleFaceResizePointerMove}
          onPointerDown={handleFaceResizePointerDown}
        >
          <boxGeometry args={displayDimensions} />
          <meshBasicMaterial
            transparent={isSimilarLabelHovered ? false : true}
            opacity={isSimilarLabelHovered ? 0.95 : opacity * 0.5}
            color={strokeAndFillColor}
          />
        </mesh>

        {faceResizeHandleProps.map(({ face, position, rotation, args }) => (
          <mesh
            key={`face-resize-${face}`}
            position={position}
            rotation={rotation}
            onPointerMove={(e) => handleFaceResizeHandlePointerMove(e, face)}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (!canArmFaceResizeHover(e)) {
                return;
              }

              if (!setHoveredLabelFromPointer(e)) {
                return;
              }

              setHoveredResizeFace(face);
              onPointerOver();
            }}
            onPointerOut={handleFaceResizeHandlePointerOut}
            onPointerDown={(e) => beginFaceResize(e, face)}
          >
            <planeGeometry args={args} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ))}

        {faceResizeHighlightProps && (
          <group
            position={faceResizeHighlightProps.position}
            rotation={faceResizeHighlightProps.rotation}
            renderOrder={1}
          >
            <mesh raycast={() => null}>
              <planeGeometry args={faceResizeHighlightProps.args} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={FACE_RESIZE_HIGHLIGHT_OPACITY}
                side={THREE.DoubleSide}
                depthTest={false}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-1}
                polygonOffsetUnits={-1}
              />
            </mesh>
            <Line
              points={getFaceResizeEdgePoints(faceResizeHighlightProps.args)}
              color={FACE_RESIZE_EDGE_COLOR}
              lineWidth={FACE_RESIZE_EDGE_LINE_WIDTH}
              depthTest={false}
              raycast={() => null}
            />
          </group>
        )}

        {shouldShowWireframe && (
          <mesh renderOrder={2} raycast={() => null}>
            <boxGeometry args={displayDimensions} />
            <meshBasicMaterial wireframe color={complementaryColor} />
          </mesh>
        )}
      </group>

      {showOrientation && (
        <CuboidOrientationMarker
          dimensions={displayDimensions}
          color={complementaryColor}
          orientation={orientationQuaternion}
          upVector={upVector}
        />
      )}
    </group>
  );

  return (
    <Transformable
      archetype="cuboid"
      isSelectedForTransform={
        isSelectedForAnnotation && transformMode !== "scale"
      }
      transformControlsRef={transformControlsRef}
      onTransformStart={handleTransformStart}
      onTransformEnd={handleTransformEnd}
      onTransformChange={handleTransformChange}
      explicitObjectRef={contentRef}
    >
      {content}
    </Transformable>
  );
};
