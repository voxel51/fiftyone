import * as fos from "@fiftyone/state";
import { Line, useCursor } from "@react-three/drei";
import {
  extend,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
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
import { FO_USER_DATA, PANEL_ID_MAIN, getPanelElementId } from "../constants";
import { useFo3dContext } from "../fo3d/context";
import {
  currentArchetypeSelectedForTransformAtom,
  hoveredLabelAtom,
  hoveredResizeFaceAtom,
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
  toNDCForElement,
} from "../utils";
import { getCameraVisibleWorldHeightAtPoint } from "../utils/side-panel-camera-sync";
import type { HoveredLabelSource } from "../types";
import type { OverlayProps } from "./shared";
import { useEventHandlers, useHoverState, useLabelColor } from "./shared/hooks";
import { Transformable } from "./shared/TransformControls";

extend({ LineSegments2, LineMaterial, LineSegmentsGeometry });

const FACE_RESIZE_EDGE_COLOR = "#ff2f2f";
const FACE_RESIZE_HIGHLIGHT_OPACITY = 0.78;
const FACE_RESIZE_HIGHLIGHT_OFFSET = 1e-4;
const FACE_RESIZE_EDGE_LINE_WIDTH = 2;
// Side panels dash the camera-far edge of the hovered face as a depth cue.
// dashSize is the edge length over this count (with a floor for tiny faces).
const FACE_RESIZE_DASHED_EDGE_SEGMENTS = 22;
const FACE_RESIZE_DASHED_EDGE_MIN_DASH = 0.01;
const ORIENTATION_MARKER_LINE_WIDTH = 4;
const ORIENTATION_MARKER_OPACITY = 0.95;
// Flat triangular arrowhead, sized relative to the cuboid's heading length.
const ORIENTATION_MARKER_EXTENSION_RATIO = 0.3;
const ORIENTATION_MARKER_HEAD_LENGTH_RATIO = 0.16;
const ORIENTATION_MARKER_MIN_HEAD_LENGTH = 0.08;
const ORIENTATION_MARKER_MIN_CROSS_SECTION_RATIO = 0.1;
// Half-width of the arrowhead base, as a fraction of its length and capped
// against the cuboid's smaller cross-section so it never overhangs the box.
const ORIENTATION_MARKER_HEAD_WIDTH_RATIO = 0.7;
const ORIENTATION_MARKER_HEAD_WIDTH_CROSS_CAP = 0.4;
const ORIENTATION_MARKER_MIN_HEAD_WIDTH = 0.03;

// Face-pull scaling handles (visible only in scale mode). A small cuboid "knob"
// of the complementary color sits at the end of a thin shaft poking straight
// out of each face along its outward normal. Because the knobs stand off the
// surface, they stay visible and grabbable in orthographic side-panel views,
// where the faces themselves are seen edge-on and are otherwise hard to click.
//
// The geometry below is authored at a base scale of 1; the group is rescaled
// every frame (see the useFrame in Cuboid) so the handle keeps a roughly
// constant on-screen size like the transform gizmo, clamped so it never grows
// past the box's largest extent (no ballooning on tiny boxes / when zoomed far
// out).
const FACE_RESIZE_HANDLE_KNOB_SIZE = 0.2;
const FACE_RESIZE_HANDLE_SHAFT_LENGTH = 0.78;
const FACE_RESIZE_HANDLE_SHAFT_RADIUS = FACE_RESIZE_HANDLE_KNOB_SIZE * 0.2;
// Screen-constant size: group scale ≈ visibleWorldHeight × this, so the knob is
// ≈ (this × KNOB_SIZE) of the viewport height and the shaft ≈ (this ×
// SHAFT_LENGTH). Keep it well under 1: above ~1 the box-extent cap in the
// useFrame always wins and this stops mattering (a knob can't fill the viewport).
const FACE_RESIZE_HANDLE_SCREEN_SCALE = 0.12;
const FACE_RESIZE_HANDLE_MIN_SCALE = 1e-3;
const FACE_RESIZE_HANDLE_HOVER_SCALE = 1.3;
// Handles rest at half opacity and go fully opaque on hover.
const FACE_RESIZE_HANDLE_OPACITY = 0.5;
const FACE_RESIZE_HANDLE_HOVER_OPACITY = 1;
const FACE_RESIZE_HANDLE_SHAFT_RADIAL_SEGMENTS = 8;

// RGB orientation axes drawn at the cuboid centroid when orientation is shown.
// Each axis length is a fraction of its own half-extent so the tripod stays
// inside the box and reflects its proportions (red = +X heading, green = +Y,
// blue = +Z).
const ORIENTATION_AXES_LENGTH_RATIO = 0.55;
const ORIENTATION_AXES_MIN_LENGTH = 0.04;
const ORIENTATION_AXES_LINE_WIDTH = 3;
const ORIENTATION_AXES_OPACITY = 0.75;
const ORIENTATION_AXES_COLORS = {
  x: "#ff4136",
  y: "#2ecc40",
  z: "#1e90ff",
} as const;

// Indexed by axis (0 = x, 1 = y, 2 = z) so face-pull shafts can be tinted to
// match the centroid RGB axes marker.
const FACE_AXIS_COLORS = [
  ORIENTATION_AXES_COLORS.x,
  ORIENTATION_AXES_COLORS.y,
  ORIENTATION_AXES_COLORS.z,
] as const;

const FACE_HANDLE_LOCAL_UP = new THREE.Vector3(0, 1, 0);

// Outward (local-space) unit normal for each resizable face.
const FACE_OUTWARD_DIRECTIONS = Object.fromEntries(
  CUBOID_RESIZE_FACES.map((face) => {
    const { axis, sign } = getCuboidResizeFaceAxis(face);
    return [face, new THREE.Vector3().setComponent(axis, sign)];
  }),
) as Record<CuboidResizeFace, THREE.Vector3>;

// Quaternion that rotates the local +Y axis (the default orientation of a
// cylinder/box) onto each face's outward normal, so a handle built along +Y
// points straight out of its face.
const FACE_OUTWARD_QUATERNIONS = Object.fromEntries(
  CUBOID_RESIZE_FACES.map((face) => [
    face,
    new THREE.Quaternion().setFromUnitVectors(
      FACE_HANDLE_LOCAL_UP,
      FACE_OUTWARD_DIRECTIONS[face],
    ),
  ]),
) as Record<CuboidResizeFace, THREE.Quaternion>;

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

// In an orthographic side-panel view a resizable face is seen edge-on, so its
// rectangle highlight collapses to a thin sliver of two near-parallel edges.
// Reliably picking the single "outer" edge isn't possible — it depends on the
// silhouette, not just camera depth — so we draw BOTH long edges and dash the
// one farther from the camera as a depth cue. When the box is axis-aligned the
// two edges coincide on screen and the solid (near) edge drawn on top covers
// the dashed one, so it still reads as a single clean line. Returns the two
// edges' endpoints in the cuboid's local frame plus a dash size for the far one.
const getCuboidFaceDepthEdges = (
  face: CuboidResizeFace,
  dimensions: THREE.Vector3Tuple,
  orientation: THREE.Quaternion,
  camera: THREE.Camera,
): {
  near: [THREE.Vector3Tuple, THREE.Vector3Tuple];
  far: [THREE.Vector3Tuple, THREE.Vector3Tuple];
  dashSize: number;
} => {
  const magnitudes = getCuboidResizeDimensionMagnitudes(dimensions);
  const { axis, sign } = getCuboidResizeFaceAxis(face);
  const [inPlaneA, inPlaneB] = [0, 1, 2].filter((a) => a !== axis);

  // Camera view direction expressed in the cuboid's local frame.
  const localViewDir = camera
    .getWorldDirection(new THREE.Vector3())
    .applyQuaternion(orientation.clone().invert())
    .normalize();

  // The in-plane axis most aligned with the view is the foreshortened "depth"
  // axis; the visible edges run along the other in-plane axis.
  const depthAxis =
    Math.abs(localViewDir.getComponent(inPlaneA)) >=
    Math.abs(localViewDir.getComponent(inPlaneB))
      ? inPlaneA
      : inPlaneB;
  const visibleAxis = depthAxis === inPlaneA ? inPlaneB : inPlaneA;

  // Camera sits opposite the view direction, so the near edge along the depth
  // axis has the opposite sign of the view component.
  const nearSign = localViewDir.getComponent(depthAxis) >= 0 ? -1 : 1;

  const makeEdge = (
    depthSign: number,
  ): [THREE.Vector3Tuple, THREE.Vector3Tuple] => {
    const endpoint = (visibleSign: number): THREE.Vector3Tuple => {
      const point: THREE.Vector3Tuple = [0, 0, 0];
      point[axis] = sign * (magnitudes[axis] / 2);
      point[depthAxis] = depthSign * (magnitudes[depthAxis] / 2);
      point[visibleAxis] = visibleSign * (magnitudes[visibleAxis] / 2);
      return point;
    };
    return [endpoint(-1), endpoint(1)];
  };

  const dashSize = Math.max(
    magnitudes[visibleAxis] / FACE_RESIZE_DASHED_EDGE_SEGMENTS,
    FACE_RESIZE_DASHED_EDGE_MIN_DASH,
  );

  return {
    near: makeEdge(nearSign),
    far: makeEdge(-nearSign),
    dashSize,
  };
};

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
  shaftStart: THREE.Vector3Tuple;
  shaftEnd: THREE.Vector3Tuple;
  headVertices: [THREE.Vector3Tuple, THREE.Vector3Tuple, THREE.Vector3Tuple];
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
  const extensionLength = length * ORIENTATION_MARKER_EXTENSION_RATIO;
  const headLength = Math.max(
    Math.min(length * ORIENTATION_MARKER_HEAD_LENGTH_RATIO, extensionLength),
    ORIENTATION_MARKER_MIN_HEAD_LENGTH,
  );
  const crossSection = Math.max(
    Math.min(localYExtent, localZExtent),
    length * ORIENTATION_MARKER_MIN_CROSS_SECTION_RATIO,
  );
  const headHalfWidth = Math.max(
    Math.min(
      headLength * ORIENTATION_MARKER_HEAD_WIDTH_RATIO,
      crossSection * ORIENTATION_MARKER_HEAD_WIDTH_CROSS_CAP,
    ),
    ORIENTATION_MARKER_MIN_HEAD_WIDTH,
  );

  const shaftEndX = faceX + extensionLength;
  const tipX = shaftEndX + headLength;
  const { y: baseY, z: baseZ } = basePoint;

  // The base point sits on the cuboid's lowest face, so its non-zero offset
  // axis is the "up" axis. Lay the flat arrowhead in the perpendicular
  // (horizontal) plane so it reads as a full triangle from a top-down view.
  const spreadAlongZ = Math.abs(baseY) >= Math.abs(baseZ);

  const apex: THREE.Vector3Tuple = [tipX, baseY, baseZ];
  const base1: THREE.Vector3Tuple = spreadAlongZ
    ? [shaftEndX, baseY, baseZ + headHalfWidth]
    : [shaftEndX, baseY + headHalfWidth, baseZ];
  const base2: THREE.Vector3Tuple = spreadAlongZ
    ? [shaftEndX, baseY, baseZ - headHalfWidth]
    : [shaftEndX, baseY - headHalfWidth, baseZ];

  return {
    shaftStart: basePoint.toArray() as THREE.Vector3Tuple,
    shaftEnd: [shaftEndX, baseY, baseZ],
    headVertices: [apex, base1, base2],
  };
};

const CuboidOrientationMarker = ({
  dimensions,
  color,
  orientation,
  upVector,
}: CuboidOrientationMarkerProps) => {
  const markerProps = useMemo(
    () => getCuboidOrientationMarkerProps(dimensions, orientation, upVector),
    [dimensions, orientation, upVector],
  );

  const headGeometry = useMemo(() => {
    if (!markerProps) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(markerProps.headVertices.flat(), 3),
    );
    return geometry;
  }, [markerProps]);

  // This effect disposes the arrowhead geometry when it is replaced or unmounts.
  useEffect(() => {
    return () => {
      headGeometry?.dispose();
    };
  }, [headGeometry]);

  if (!markerProps || !headGeometry) {
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
      <mesh geometry={headGeometry} renderOrder={3} raycast={() => null}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={ORIENTATION_MARKER_OPACITY}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

interface CuboidAxesMarkerProps {
  dimensions: THREE.Vector3Tuple;
}

// Basic RGB axes drawn at the cuboid centroid. Rendered in the cuboid's local
// frame (the parent group already carries its orientation), so the axes track
// the box's heading: +X red, +Y green, +Z blue.
const CuboidAxesMarker = ({ dimensions }: CuboidAxesMarkerProps) => {
  const axes = useMemo(() => {
    const half = (axis: 0 | 1 | 2) =>
      Math.max(
        (getFiniteMagnitude(dimensions[axis]) / 2) *
          ORIENTATION_AXES_LENGTH_RATIO,
        ORIENTATION_AXES_MIN_LENGTH,
      );

    return [
      { color: ORIENTATION_AXES_COLORS.x, end: [half(0), 0, 0] },
      { color: ORIENTATION_AXES_COLORS.y, end: [0, half(1), 0] },
      { color: ORIENTATION_AXES_COLORS.z, end: [0, 0, half(2)] },
    ] as { color: string; end: THREE.Vector3Tuple }[];
  }, [dimensions]);

  return (
    <group userData={{ [FO_USER_DATA.IS_HELPER]: true }} renderOrder={3}>
      {axes.map(({ color, end }) => (
        <Line
          key={color}
          points={[[0, 0, 0], end] as THREE.Vector3Tuple[]}
          color={color}
          lineWidth={ORIENTATION_AXES_LINE_WIDTH}
          opacity={ORIENTATION_AXES_OPACITY}
          transparent
          depthTest={false}
          raycast={() => null}
        />
      ))}
    </group>
  );
};

interface CuboidFaceResizeHandleProps {
  face: CuboidResizeFace;
  faceCenter: THREE.Vector3Tuple;
  quaternion: THREE.Quaternion;
  color: string;
  shaftColor: string;
  hovered: boolean;
  onGroupRef: (face: CuboidResizeFace, group: THREE.Group | null) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}

// A single face-pull handle: a thin shaft topped with a small cuboid knob,
// oriented so it points straight out of its face. The shaft is tinted by its
// axis (matching the centroid RGB axes marker) so it doubles as an orientation
// cue; the complementary-colored knob is the primary grab target. Both share
// the face's pointer handlers (events bubble up from the meshes to this group).
// Drawn on top (depthTest off) so it remains grabbable even when the face is
// behind the box in an orthographic view. The geometry is authored at base
// scale 1; the parent rescales the group each frame for constant screen size.
const CuboidFaceResizeHandle = ({
  face,
  faceCenter,
  quaternion,
  color,
  shaftColor,
  hovered,
  onGroupRef,
  onPointerMove,
  onPointerOver,
  onPointerOut,
  onPointerDown,
}: CuboidFaceResizeHandleProps) => {
  const knobScale = hovered ? FACE_RESIZE_HANDLE_HOVER_SCALE : 1;
  const knobColor = hovered ? FACE_RESIZE_EDGE_COLOR : color;
  const handleOpacity = hovered
    ? FACE_RESIZE_HANDLE_HOVER_OPACITY
    : FACE_RESIZE_HANDLE_OPACITY;
  // Stable ref so the parent's per-frame scaler can track this group.
  const groupRef = useCallback(
    (group: THREE.Group | null) => onGroupRef(face, group),
    [face, onGroupRef],
  );

  return (
    <group
      ref={groupRef}
      position={faceCenter}
      quaternion={quaternion}
      onPointerMove={onPointerMove}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerDown={onPointerDown}
    >
      <mesh
        position={[0, FACE_RESIZE_HANDLE_SHAFT_LENGTH / 2, 0]}
        renderOrder={4}
      >
        <cylinderGeometry
          args={[
            FACE_RESIZE_HANDLE_SHAFT_RADIUS,
            FACE_RESIZE_HANDLE_SHAFT_RADIUS,
            FACE_RESIZE_HANDLE_SHAFT_LENGTH,
            FACE_RESIZE_HANDLE_SHAFT_RADIAL_SEGMENTS,
          ]}
        />
        <meshBasicMaterial
          color={shaftColor}
          transparent
          opacity={handleOpacity}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[
          0,
          FACE_RESIZE_HANDLE_SHAFT_LENGTH + FACE_RESIZE_HANDLE_KNOB_SIZE / 2,
          0,
        ]}
        scale={knobScale}
        renderOrder={4}
      >
        <boxGeometry
          args={[
            FACE_RESIZE_HANDLE_KNOB_SIZE,
            FACE_RESIZE_HANDLE_KNOB_SIZE,
            FACE_RESIZE_HANDLE_KNOB_SIZE,
          ]}
        />
        <meshBasicMaterial
          color={knobColor}
          transparent
          opacity={handleOpacity}
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
  const hoveredResizeFaceState = useRecoilValue(hoveredResizeFaceAtom);
  const setHoveredResizeFaceState = useSetRecoilState(hoveredResizeFaceAtom);
  // Hovered resize face is shared across panels (keyed by label) so the hover
  // feedback (handle opacity/scale, face highlight) appears in every panel, not
  // just the one under the cursor.
  const hoveredResizeFace =
    hoveredResizeFaceState?.labelId === label._id
      ? hoveredResizeFaceState.face
      : null;
  const setHoveredResizeFace = useCallback(
    (face: CuboidResizeFace | null) => {
      setHoveredResizeFaceState((prev) => {
        if (face) {
          return { labelId: label._id, face, source: hoverSource };
        }
        // Only clear if this exact (label, panel) owns the current hover, so a
        // pointer-out or deselect elsewhere can't wipe another panel's hover.
        return prev?.labelId === label._id && prev?.source === hoverSource
          ? null
          : prev;
      });
    },
    [label._id, hoverSource, setHoveredResizeFaceState],
  );
  const [isFaceResizeDragging, setIsFaceResizeDragging] = useState(false);
  const faceResizeDragRef = useRef<FaceResizeDragState | null>(null);
  const isDisablingControlsForFaceResizeRef = useRef(false);
  const raycasterRef = useRef(new THREE.Raycaster());
  const suppressNextClickRef = useRef(false);
  const panelElementRef = useRef<HTMLElement | null>(null);
  // Per-face handle groups, so the frame loop can rescale them for constant
  // on-screen size; the reused vector holds the box's world center.
  const handleGroupRefs = useRef(new Map<CuboidResizeFace, THREE.Group>());
  const handleScaleCenterRef = useRef(new THREE.Vector3());
  const registerHandleGroup = useCallback(
    (face: CuboidResizeFace, group: THREE.Group | null) => {
      if (group) {
        handleGroupRefs.current.set(face, group);
      } else {
        handleGroupRefs.current.delete(face);
      }
    },
    [],
  );

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

  // This frame loop keeps the face-pull handles at a roughly constant on-screen
  // size (like the transform gizmo) by rescaling each handle group from the
  // camera's visible world height at the box — works for the perspective main
  // panel and the orthographic side panels alike.
  useFrame(() => {
    const groups = handleGroupRefs.current;
    if (!canFaceResize || groups.size === 0 || !contentRef.current) {
      return;
    }

    const visibleHeight = getCameraVisibleWorldHeightAtPoint(
      camera,
      contentRef.current.getWorldPosition(handleScaleCenterRef.current),
    );
    if (!visibleHeight || visibleHeight <= 0) {
      return;
    }

    // Cap at the box's largest extent so the handle can't reach past the box
    // (prevents ballooning on tiny boxes / when zoomed far out) while staying
    // generous enough that the screen-constant size is what's used in normal
    // working views rather than the cap.
    const maxExtent = Math.max(
      Math.abs(displayDimensions[0]),
      Math.abs(displayDimensions[1]),
      Math.abs(displayDimensions[2]),
    );
    const scale = Math.min(
      Math.max(
        visibleHeight * FACE_RESIZE_HANDLE_SCREEN_SCALE,
        FACE_RESIZE_HANDLE_MIN_SCALE,
      ),
      maxExtent,
    );

    groups.forEach((group) => {
      group.scale.setScalar(scale);
    });
  });

  // This effect tracks the DOM element backing this cuboid's panel. Each panel
  // is a drei <View> sharing one canvas, so pointer-to-NDC conversion must use
  // the panel's own viewport rect; the shared canvas rect is only correct for a
  // panel that fills it. Mirrors RaycastService's per-panel resolution.
  useEffect(() => {
    panelElementRef.current =
      hoverSource === "sidebar"
        ? null
        : document.getElementById(getPanelElementId(hoverSource));
  }, [hoverSource]);

  const getPointerDragPlaneIntersection = useCallback(
    (event: PointerEvent, plane: THREE.Plane) => {
      const panelElement = panelElementRef.current;
      const ndc = panelElement
        ? toNDCForElement(event, panelElement)
        : toNDC(event, gl.domElement);
      return getPlaneIntersection(raycasterRef.current, camera, ndc, plane);
    },
    [camera, gl],
  );

  const beginFaceResize = useCallback(
    (e: ThreeEvent<PointerEvent>, face: CuboidResizeFace | null) => {
      if (!canFaceResize || !face) {
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
      setHoveredResizeFace,
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
    [
      canFaceResize,
      isFaceResizeDragging,
      restEventHandlers,
      setHoveredResizeFace,
    ],
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
    [
      canFaceResize,
      isFaceResizeDragging,
      restEventHandlers,
      setHoveredResizeFace,
    ],
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
    [isFaceResizeDragging, onPointerOut, setHoveredLabel, setHoveredResizeFace],
  );

  const armFaceResizeHover = useCallback(
    (e: ThreeEvent<PointerEvent>, face: CuboidResizeFace) => {
      e.stopPropagation();

      if (!canArmFaceResizeHover(e)) {
        return;
      }

      if (!setHoveredLabelFromPointer(e)) {
        return;
      }

      setHoveredResizeFace(face);
      onPointerOver(e);
    },
    [onPointerOver, setHoveredLabelFromPointer, setHoveredResizeFace],
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
  }, [handleFaceResizeEnd, setHoveredResizeFace, setIsCurrentlyTransforming]);

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
      finishFaceResize();
    };
  }, [finishFaceResize, isFaceResizeDragging, updateFaceResizeFromPointer]);

  // This effect clears the hovered resize face once face-resizing is no longer
  // available and no drag is in progress.
  useEffect(() => {
    if (!canFaceResize && !isFaceResizeDragging) {
      setHoveredResizeFace(null);
    }
  }, [canFaceResize, isFaceResizeDragging, setHoveredResizeFace]);

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

  // Side panels are orthographic and view faces edge-on, so the hovered face is
  // highlighted as its two long edges (far one dashed) rather than the full
  // rectangle-with-fill used in the perspective main panel.
  const isSidePanel = hoverSource !== PANEL_ID_MAIN;
  const faceResizeSidePanelEdges =
    faceResizeHighlightProps && isSidePanel && hoveredResizeFace
      ? getCuboidFaceDepthEdges(
          hoveredResizeFace,
          displayDimensions,
          orientationQuaternion,
          camera,
        )
      : null;
  const faceResizeHandleProps = canFaceResize
    ? CUBOID_RESIZE_FACES.map((face) => ({
        face,
        ...getFaceResizeHighlightProps(face, displayDimensions),
      }))
    : [];

  // Face-center offsets place each handle on its face (in world units); the
  // handle's own size is driven per frame by the useFrame scaler above.
  const faceResizeMagnitudes =
    getCuboidResizeDimensionMagnitudes(displayDimensions);

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

          onPointerOver(e);
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

        {faceResizeHandleProps.map(({ face, position, rotation, args }) => {
          const { axis } = getCuboidResizeFaceAxis(face);
          const halfExtent = faceResizeMagnitudes[axis] / 2;
          const outward = FACE_OUTWARD_DIRECTIONS[face];
          const faceCenter: THREE.Vector3Tuple = [
            outward.x * halfExtent,
            outward.y * halfExtent,
            outward.z * halfExtent,
          ];
          const handlePointerMove = (e: ThreeEvent<PointerEvent>) =>
            handleFaceResizeHandlePointerMove(e, face);
          const handlePointerOver = (e: ThreeEvent<PointerEvent>) =>
            armFaceResizeHover(e, face);
          const handlePointerDown = (e: ThreeEvent<PointerEvent>) =>
            beginFaceResize(e, face);

          return (
            <group key={`face-resize-${face}`}>
              {/* Invisible full-face grab plane (works in perspective views). */}
              <mesh
                position={position}
                rotation={rotation}
                onPointerMove={handlePointerMove}
                onPointerOver={handlePointerOver}
                onPointerOut={handleFaceResizeHandlePointerOut}
                onPointerDown={handlePointerDown}
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

              {/* Visible pull handle (grabbable from orthographic views). */}
              <CuboidFaceResizeHandle
                face={face}
                faceCenter={faceCenter}
                quaternion={FACE_OUTWARD_QUATERNIONS[face]}
                color={complementaryColor}
                shaftColor={FACE_AXIS_COLORS[axis]}
                hovered={hoveredResizeFace === face}
                onGroupRef={registerHandleGroup}
                onPointerMove={handlePointerMove}
                onPointerOver={handlePointerOver}
                onPointerOut={handleFaceResizeHandlePointerOut}
                onPointerDown={handlePointerDown}
              />
            </group>
          );
        })}

        {faceResizeHighlightProps &&
          (faceResizeSidePanelEdges ? (
            // Side panel (orthographic): the face is edge-on, so draw both long
            // edges and dash the camera-far one as a depth cue. The near (solid)
            // edge has the higher renderOrder so it sits on top when the two
            // coincide (axis-aligned views), reading as a single clean line.
            <>
              <Line
                points={faceResizeSidePanelEdges.far}
                color={FACE_RESIZE_EDGE_COLOR}
                lineWidth={FACE_RESIZE_EDGE_LINE_WIDTH}
                dashed
                dashSize={faceResizeSidePanelEdges.dashSize}
                gapSize={faceResizeSidePanelEdges.dashSize}
                depthTest={false}
                renderOrder={1}
                raycast={() => null}
              />
              <Line
                points={faceResizeSidePanelEdges.near}
                color={FACE_RESIZE_EDGE_COLOR}
                lineWidth={FACE_RESIZE_EDGE_LINE_WIDTH}
                depthTest={false}
                renderOrder={2}
                raycast={() => null}
              />
            </>
          ) : (
            // Main panel (perspective): full face rectangle with fill.
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
          ))}

        {shouldShowWireframe && (
          <mesh renderOrder={2} raycast={() => null}>
            <boxGeometry args={displayDimensions} />
            <meshBasicMaterial wireframe color={complementaryColor} />
          </mesh>
        )}
      </group>

      {showOrientation && (
        <>
          <CuboidOrientationMarker
            dimensions={displayDimensions}
            color={complementaryColor}
            orientation={orientationQuaternion}
            upVector={upVector}
          />
          <CuboidAxesMarker dimensions={displayDimensions} />
        </>
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
