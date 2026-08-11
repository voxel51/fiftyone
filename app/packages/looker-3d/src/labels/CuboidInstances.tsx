/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import type { ThreeEvent } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import type { ReconciledDetection3D } from "../annotation/types";
import { PANEL_ID_MAIN } from "../constants";
import { use3dLabelColor } from "../hooks/use-3d-label-color";
import { useSimilarLabels3d } from "../hooks/use-similar-labels-3d";
import {
  useCurrentSelected3dAnnotationLabel,
  useHoveredLabel3d,
  useIsCurrentlyTransforming,
  useSetHoveredLabel3d,
} from "../state/accessors";
import type { HoveredLabelSource } from "../types";
import { getComplementaryColor } from "../utils";
import {
  AXES_SEGMENTS_PER_BOX,
  EDGES_PER_BOX,
  SHAFT_SEGMENTS_PER_BOX,
  UNIT_ARROWHEAD_GEOMETRY,
  UNIT_BOX_GEOMETRY,
  ZERO_SCALE_MATRIX,
  computeArrowheadMatrix,
  computeBodyMatrix,
  computeBoxEdgePositions,
  localToWorld,
  resolveCuboidGeometry,
  setSegmentColor,
} from "./cuboid-instance-geometry";
import {
  createHoverIndexTracker,
  resolveLabelByInstanceId,
} from "./cuboid-instance-interaction";
import {
  ORIENTATION_AXES_COLORS,
  ORIENTATION_AXES_LENGTH_RATIO,
  ORIENTATION_AXES_MIN_LENGTH,
  getCuboidOrientationMarkerGeometry,
  getFiniteMagnitude,
} from "./shared/cuboid-orientation-geometry";
import { useEventHandlers } from "./shared/hooks";
import { shouldSuppressHoverOnPointer } from "./shared/shouldSuppressHoverOnPointer";
import "./shared/registerLineElements";
import { useDragGate } from "./shared/useDragGate";

export interface CuboidInstancesProps {
  detections: readonly ReconciledDetection3D[];
  /** Base per-label color (color-by mode already resolved upstream), before hover/selection layering. */
  getColor: (label: ReconciledDetection3D) => string;
  /** Shared opacity for every box in the batch (see plan §6 — at most one value is ever live for the whole non-focused batch). */
  opacity: number;
  lineWidth: number;
  useLegacyCoordinates: boolean;
  /** Euler fallback for a label with no `rotation` of its own (see `resolveCuboidGeometry`). */
  overlayRotationFallback: THREE.Vector3Tuple;
  hoverSource?: HoveredLabelSource;
  showOrientation?: boolean;
  onClick: (label: ReconciledDetection3D, e: ThreeEvent<MouseEvent>) => void;
}

/**
 * Batches every non-edited cuboid label into a handful of draw calls instead
 * of one full component tree per label (see the looker3dInstanceMesh plan):
 * one `InstancedMesh` for bodies (also the clickable/hoverable volume), one
 * merged `LineSegmentsGeometry` for outlines (+ shaft/axes segments when
 * `showOrientation`), and one `InstancedMesh` for orientation arrowheads.
 *
 * Geometry only rebuilds on membership change (select/deselect/create/delete
 * are rare); color updates react per-label via headless "shadow" components
 * (`CuboidColorSync`) that write directly into the shared color buffers.
 */
const AXES_COLOR_BY_AXIS = [
  ORIENTATION_AXES_COLORS.x,
  ORIENTATION_AXES_COLORS.y,
  ORIENTATION_AXES_COLORS.z,
] as const;

export const CuboidInstances = ({
  detections,
  getColor,
  opacity,
  lineWidth,
  useLegacyCoordinates,
  overlayRotationFallback,
  hoverSource = PANEL_ID_MAIN,
  showOrientation = false,
  onClick,
}: CuboidInstancesProps) => {
  const hoveredLabel = useHoveredLabel3d();
  const isCurrentlyTransforming = useIsCurrentlyTransforming();
  const setHoveredLabel = useSetHoveredLabel3d();

  const bodyMeshRef = useRef<THREE.InstancedMesh>(null);
  const arrowMeshRef = useRef<THREE.InstancedMesh>(null);
  // Both geometries are rebuilt (new object) on membership change, so they
  // live in state — a ref wouldn't trigger the JSX to pick up the new
  // object. The `previous*Ref`s track the outgoing geometry so it can be
  // disposed once the new one is committed.
  const [outlineGeometry, setOutlineGeometry] =
    useState<LineSegmentsGeometry | null>(null);
  const previousOutlineGeometryRef = useRef<LineSegmentsGeometry | null>(null);
  // Heading shafts and the RGB axes tripods live in separate geometries from
  // each other and from the edge outline, because all three want different
  // depth behaviour: shafts extend past the box surface and are depth-tested,
  // axes sit inside it and must draw on top, edges are coincident with it.
  const [shaftGeometry, setShaftGeometry] =
    useState<LineSegmentsGeometry | null>(null);
  const previousShaftGeometryRef = useRef<LineSegmentsGeometry | null>(null);
  const [axesGeometry, setAxesGeometry] = useState<LineSegmentsGeometry | null>(
    null,
  );
  const previousAxesGeometryRef = useRef<LineSegmentsGeometry | null>(null);

  // Deliberately no `vertexColors: true` here: these geometries (a plain
  // unit box / triangle) have no geometry `color` attribute, and setting
  // `material.vertexColors` forces the vertex shader to also read that
  // (missing) attribute, which defaults to (0,0,0) and zeroes the instance
  // color out to black. `instanceColor` alone (once assigned below) already
  // makes three.js define `USE_INSTANCING_COLOR` / `USE_COLOR` correctly —
  // see WebGLProgram.js's `instancingColor` handling.
  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity,
      }),
    [opacity],
  );
  // Arrowheads sit beyond the forward face, so ordinary depth testing reads
  // correctly and occludes them when the heading points away from the camera.
  const arrowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [opacity],
  );
  const outlineMaterial = useMemo(
    () =>
      new LineMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        linewidth: lineWidth,
      }),
    [opacity, lineWidth],
  );
  // Heading shafts run from the forward face outward past the surface, so they
  // depth-test normally — matching the standalone `CuboidOrientationMarker`.
  const shaftMaterial = useMemo(
    () =>
      new LineMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        linewidth: lineWidth,
      }),
    [opacity, lineWidth],
  );
  // The axes tripods, by contrast, only reach `ORIENTATION_AXES_LENGTH_RATIO`
  // (< 1) of the half-dimension from the centroid, so they never leave the box:
  // with normal depth testing they'd always be buried behind its front face and
  // never render. Same override the standalone `CuboidAxesMarker` carries.
  const axesMaterial = useMemo(
    () =>
      new LineMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        linewidth: lineWidth,
        depthTest: false,
      }),
    [opacity, lineWidth],
  );

  useEffect(() => {
    return () => {
      bodyMaterial.dispose();
      arrowMaterial.dispose();
      outlineMaterial.dispose();
      shaftMaterial.dispose();
      axesMaterial.dispose();
    };
  }, [
    bodyMaterial,
    arrowMaterial,
    outlineMaterial,
    shaftMaterial,
    axesMaterial,
  ]);

  // Stable index maps, rebuilt only when the *set* of labels changes (not on
  // every parent re-render, which produces a new array reference regardless
  // of content) — the actively-edited label is always excluded from this
  // array upstream (see `ThreeDLabels`), so membership changes are rare,
  // user-driven events (select/deselect/create/delete).
  const membershipKey = useMemo(
    () => detections.map((label) => label._id).join("|"),
    [detections],
  );

  const labelsByIndex = useMemo(
    () => detections,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [membershipKey],
  );

  const count = labelsByIndex.length;
  // Rebuild every buffer when membership or batch-level rendering settings
  // change. Per-label *color* changes (hover/select/similar/color-by-mode)
  // are handled reactively by `CuboidColorSync` below instead of here — this
  // effect only needs to re-run for structural changes.
  useLayoutEffect(() => {
    if (count === 0) {
      setOutlineGeometry(null);
      setShaftGeometry(null);
      setAxesGeometry(null);
      return;
    }

    const geometries = labelsByIndex.map((label) =>
      resolveCuboidGeometry(
        label,
        useLegacyCoordinates,
        overlayRotationFallback,
      ),
    );

    // Bodies
    const bodyMesh = bodyMeshRef.current;
    if (bodyMesh) {
      const bodyColors = new Float32Array(count * 3);
      const bodyColorAttribute = new THREE.InstancedBufferAttribute(
        bodyColors,
        3,
      );
      geometries.forEach((geometry, i) => {
        bodyMesh.setMatrixAt(i, computeBodyMatrix(geometry));
        const color = new THREE.Color(getColor(labelsByIndex[i]));
        bodyColorAttribute.setXYZ(i, color.r, color.g, color.b);
      });
      bodyMesh.instanceMatrix.needsUpdate = true;
      bodyMesh.instanceColor = bodyColorAttribute;
      bodyMesh.computeBoundingSphere();
    }

    // Edge outline — separate buffer from orientation markers (see
    // `orientationMaterial` for why): edges need normal depth testing.
    const edgePositions = new Float32Array(count * EDGES_PER_BOX * 6);
    const edgeColors = new Float32Array(count * EDGES_PER_BOX * 6);

    // Heading shafts and axes tripods get their own buffers so they can be drawn
    // with different depth behaviour. Zero-length when `showOrientation` is off.
    const shaftSegments = showOrientation ? SHAFT_SEGMENTS_PER_BOX : 0;
    const axesSegments = showOrientation ? AXES_SEGMENTS_PER_BOX : 0;
    const shaftPositions = new Float32Array(count * shaftSegments * 6);
    const shaftColors = new Float32Array(count * shaftSegments * 6);
    const axesPositions = new Float32Array(count * axesSegments * 6);
    const axesColors = new Float32Array(count * axesSegments * 6);

    const arrowMatrices: THREE.Matrix4[] = [];

    geometries.forEach((geometry, i) => {
      const edgeFloatBase = i * EDGES_PER_BOX * 6;
      edgePositions.set(computeBoxEdgePositions(geometry), edgeFloatBase);

      const baseColor = new THREE.Color(getColor(labelsByIndex[i]));
      for (let s = 0; s < EDGES_PER_BOX; s++) {
        const o = edgeFloatBase + s * 6;
        edgeColors.set(
          [
            baseColor.r,
            baseColor.g,
            baseColor.b,
            baseColor.r,
            baseColor.g,
            baseColor.b,
          ],
          o,
        );
      }

      if (!showOrientation) {
        arrowMatrices.push(ZERO_SCALE_MATRIX);
        return;
      }

      const markerGeometry = getCuboidOrientationMarkerGeometry(
        geometry.dimensions,
      );
      const complementaryColor = new THREE.Color(
        getComplementaryColor(getColor(labelsByIndex[i])),
      );

      const shaftFloatBase = i * shaftSegments * 6;
      if (markerGeometry) {
        const shaftStartWorld = localToWorld(
          markerGeometry.shaftStart,
          geometry,
        );
        const shaftEndWorld = localToWorld(markerGeometry.anchor, geometry);
        shaftPositions.set(
          [...shaftStartWorld, ...shaftEndWorld],
          shaftFloatBase,
        );
      }
      shaftColors.set(
        [
          complementaryColor.r,
          complementaryColor.g,
          complementaryColor.b,
          complementaryColor.r,
          complementaryColor.g,
          complementaryColor.b,
        ],
        shaftFloatBase,
      );

      arrowMatrices.push(
        markerGeometry ? computeArrowheadMatrix(geometry) : ZERO_SCALE_MATRIX,
      );

      const axesFloatBase = i * axesSegments * 6;
      const halfExtent = (axis: 0 | 1 | 2) =>
        Math.max(
          (getFiniteMagnitude(geometry.dimensions[axis]) / 2) *
            ORIENTATION_AXES_LENGTH_RATIO,
          ORIENTATION_AXES_MIN_LENGTH,
        );
      const axesLocalEnds: THREE.Vector3Tuple[] = [
        [halfExtent(0), 0, 0],
        [0, halfExtent(1), 0],
        [0, 0, halfExtent(2)],
      ];
      const originWorld = localToWorld([0, 0, 0], geometry);
      axesLocalEnds.forEach((localEnd, axis) => {
        const endWorld = localToWorld(localEnd, geometry);
        const o = axesFloatBase + axis * 6;
        axesPositions.set([...originWorld, ...endWorld], o);
        const axisColor = new THREE.Color(AXES_COLOR_BY_AXIS[axis]);
        axesColors.set(
          [
            axisColor.r,
            axisColor.g,
            axisColor.b,
            axisColor.r,
            axisColor.g,
            axisColor.b,
          ],
          o,
        );
      });
    });

    const nextOutlineGeometry = new LineSegmentsGeometry();
    nextOutlineGeometry.setPositions(edgePositions);
    nextOutlineGeometry.setColors(edgeColors);
    previousOutlineGeometryRef.current?.dispose();
    previousOutlineGeometryRef.current = nextOutlineGeometry;
    setOutlineGeometry(nextOutlineGeometry);

    if (showOrientation) {
      const nextShaftGeometry = new LineSegmentsGeometry();
      nextShaftGeometry.setPositions(shaftPositions);
      nextShaftGeometry.setColors(shaftColors);
      previousShaftGeometryRef.current?.dispose();
      previousShaftGeometryRef.current = nextShaftGeometry;
      setShaftGeometry(nextShaftGeometry);

      const nextAxesGeometry = new LineSegmentsGeometry();
      nextAxesGeometry.setPositions(axesPositions);
      nextAxesGeometry.setColors(axesColors);
      previousAxesGeometryRef.current?.dispose();
      previousAxesGeometryRef.current = nextAxesGeometry;
      setAxesGeometry(nextAxesGeometry);
    } else {
      previousShaftGeometryRef.current?.dispose();
      previousShaftGeometryRef.current = null;
      setShaftGeometry(null);
      previousAxesGeometryRef.current?.dispose();
      previousAxesGeometryRef.current = null;
      setAxesGeometry(null);
    }

    // Arrowheads
    const arrowMesh = arrowMeshRef.current;
    if (arrowMesh && showOrientation) {
      const arrowColors = new Float32Array(count * 3);
      const arrowColorAttribute = new THREE.InstancedBufferAttribute(
        arrowColors,
        3,
      );
      arrowMatrices.forEach((matrix, i) => {
        arrowMesh.setMatrixAt(i, matrix);
        const complementaryColor = new THREE.Color(
          getComplementaryColor(getColor(labelsByIndex[i])),
        );
        arrowColorAttribute.setXYZ(
          i,
          complementaryColor.r,
          complementaryColor.g,
          complementaryColor.b,
        );
      });
      arrowMesh.instanceMatrix.needsUpdate = true;
      arrowMesh.instanceColor = arrowColorAttribute;
      arrowMesh.computeBoundingSphere();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    membershipKey,
    count,
    useLegacyCoordinates,
    overlayRotationFallback,
    showOrientation,
  ]);

  // Dispose the last-built geometries on unmount.
  useEffect(() => {
    return () => {
      previousOutlineGeometryRef.current?.dispose();
      previousShaftGeometryRef.current?.dispose();
      previousAxesGeometryRef.current?.dispose();
    };
  }, []);

  const {
    onPointerOver: onPointerOverForLabel,
    onPointerOut: onPointerOutForLabel,
    onPointerMove: onPointerMoveForLabel,
  } = useEventHandlers();

  const {
    onPointerDown,
    onPointerMove: onDragGatePointerMove,
    onPointerUp,
    isClick,
  } = useDragGate();

  const resolveLabel = useCallback(
    (instanceId: number | undefined) =>
      resolveLabelByInstanceId(labelsByIndex, instanceId),
    [labelsByIndex],
  );

  // r3f doesn't guarantee `instanceId` on an InstancedMesh's pointer-out
  // event, so track which instance is currently hovered ourselves and
  // resolve the outgoing label from that on pointer-out.
  const hoverTrackerRef = useRef(createHoverIndexTracker());

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (
        shouldSuppressHoverOnPointer(
          hoverSource,
          isCurrentlyTransforming,
          e.nativeEvent.buttons,
        )
      ) {
        return;
      }
      const label = resolveLabel(e.instanceId);
      if (!label) return;

      hoverTrackerRef.current.setHovered(e.instanceId ?? null);
      setHoveredLabel({ id: label._id, source: hoverSource });
      onPointerOverForLabel(label, e);
    },
    [
      resolveLabel,
      hoverSource,
      isCurrentlyTransforming,
      setHoveredLabel,
      onPointerOverForLabel,
    ],
  );

  const handlePointerOut = useCallback(() => {
    const index = hoverTrackerRef.current.consumeHovered();
    const label = resolveLabelByInstanceId(labelsByIndex, index ?? undefined);

    setHoveredLabel(null);
    if (label) {
      onPointerOutForLabel(label);
    }
  }, [labelsByIndex, setHoveredLabel, onPointerOutForLabel]);

  // Runs both the drag-vs-click threshold tracking (`useDragGate`) and the
  // tooltip-position tracking (`useMeshTooltipProps`'s onPointerMove, which
  // publishes `fos.tooltipCoordinates`) — the standalone `Cuboid` path gets
  // both from separate elements (the drag-gate wrapper vs. the mesh's own
  // handler); the instanced batch needs both on this one mesh.
  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      onDragGatePointerMove(e);
      const label = resolveLabel(e.instanceId);
      if (label) {
        onPointerMoveForLabel(label, e);
      }
    },
    [onDragGatePointerMove, resolveLabel, onPointerMoveForLabel],
  );

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!isClick()) {
        e.stopPropagation();
        return;
      }
      const label = resolveLabel(e.instanceId);
      if (!label) return;
      onClick(label, e);
    },
    [isClick, resolveLabel, onClick],
  );

  if (count === 0) {
    return null;
  }

  // At most one instanced label is ever hovered at a time, so the hover
  // wireframe (matching the standalone Cuboid's `shouldShowWireframe`
  // overlay) doesn't need instancing — just one conditionally-mounted mesh
  // for whichever label currently matches `hoveredLabelAtom`.
  const hoveredBatchLabel = hoveredLabel
    ? (labelsByIndex.find((label) => label._id === hoveredLabel.id) ?? null)
    : null;

  return (
    <>
      <instancedMesh
        ref={bodyMeshRef}
        args={[UNIT_BOX_GEOMETRY, bodyMaterial, count]}
        renderOrder={0}
        onPointerDown={onPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      />
      {outlineGeometry && (
        // @ts-expect-error — registered via ./shared/registerLineElements
        <lineSegments2
          geometry={outlineGeometry}
          material={outlineMaterial}
          // Both this and the body mesh sit at the same local origin (all
          // real per-box placement lives in instance matrices / the merged
          // buffer, not the object's own transform), so three.js's
          // transparency depth-sort sees them as equidistant and falls back
          // to unreliable tie-breaking. Force a deterministic order instead:
          // draw the outline after the body so it always wins the depth
          // test at their coincident surface and stays visible.
          renderOrder={1}
          raycast={() => null}
        />
      )}
      {shaftGeometry && (
        // @ts-expect-error — registered via ./shared/registerLineElements
        <lineSegments2
          geometry={shaftGeometry}
          material={shaftMaterial}
          // Matches the standalone `CuboidOrientationMarker`'s renderOrder.
          // Depth-tested, so a heading pointing away is correctly occluded.
          renderOrder={3}
          raycast={() => null}
        />
      )}
      {axesGeometry && (
        // @ts-expect-error — registered via ./shared/registerLineElements
        <lineSegments2
          geometry={axesGeometry}
          material={axesMaterial}
          // `depthTest: false` on `axesMaterial` is what keeps these visible
          // through the box body; renderOrder just matches the standalone path.
          renderOrder={3}
          raycast={() => null}
        />
      )}
      {showOrientation && (
        <instancedMesh
          ref={arrowMeshRef}
          args={[UNIT_ARROWHEAD_GEOMETRY, arrowMaterial, count]}
          renderOrder={3}
          raycast={() => null}
        />
      )}
      {outlineGeometry &&
        labelsByIndex.map((label, index) => (
          <CuboidColorSync
            key={label._id}
            label={label}
            index={index}
            baseColor={getColor(label)}
            bodyMeshRef={bodyMeshRef}
            arrowMeshRef={arrowMeshRef}
            outlineGeometry={outlineGeometry}
            shaftGeometry={shaftGeometry}
            showOrientation={showOrientation}
          />
        ))}
      {hoveredBatchLabel && (
        <CuboidHoverWireframe
          label={hoveredBatchLabel}
          baseColor={getColor(hoveredBatchLabel)}
          useLegacyCoordinates={useLegacyCoordinates}
          overlayRotationFallback={overlayRotationFallback}
        />
      )}
    </>
  );
};

interface CuboidHoverWireframeProps {
  label: ReconciledDetection3D;
  baseColor: string;
  useLegacyCoordinates: boolean;
  overlayRotationFallback: THREE.Vector3Tuple;
}

/**
 * Mirrors the standalone `Cuboid`'s `shouldShowWireframe` overlay — a plain
 * `BoxGeometry` rendered `wireframe`, whose default 2-triangle-per-face
 * triangulation is what produces the diagonal line across each face. Only
 * ever mounted for the single (if any) hovered label in this batch.
 */
const CuboidHoverWireframe = ({
  label,
  baseColor,
  useLegacyCoordinates,
  overlayRotationFallback,
}: CuboidHoverWireframeProps) => {
  const isSimilarLabelHovered = useSimilarLabels3d(label);
  const selected = Boolean((label as { selected?: boolean }).selected);

  const strokeAndFillColor = use3dLabelColor({
    isSelected: selected,
    isHovered: true,
    isSimilarLabelHovered,
    defaultColor: baseColor,
    isSelectedForAnnotation: false,
  });
  const complementaryColor = useMemo(
    () => getComplementaryColor(strokeAndFillColor),
    [strokeAndFillColor],
  );

  const geometry = useMemo(
    () =>
      resolveCuboidGeometry(
        label,
        useLegacyCoordinates,
        overlayRotationFallback,
      ),
    [label, useLegacyCoordinates, overlayRotationFallback],
  );

  return (
    <mesh
      position={geometry.position}
      quaternion={geometry.quaternion}
      renderOrder={2}
      raycast={() => null}
    >
      <boxGeometry args={geometry.dimensions} />
      <meshBasicMaterial wireframe color={complementaryColor} />
    </mesh>
  );
};

interface CuboidColorSyncProps {
  label: ReconciledDetection3D;
  index: number;
  baseColor: string;
  bodyMeshRef: RefObject<THREE.InstancedMesh>;
  arrowMeshRef: RefObject<THREE.InstancedMesh>;
  outlineGeometry: LineSegmentsGeometry;
  shaftGeometry: LineSegmentsGeometry | null;
  showOrientation: boolean;
}

/**
 * Headless per-label component (no scene-graph output) that subscribes to
 * the exact same color-resolution hooks the standalone `Cuboid` uses
 * (`use3dLabelColor`, `hoveredLabelAtom`, `useSimilarLabels3d`) and, on
 * change, writes directly into this label's fixed slot in the shared color
 * buffers — O(k) updates on hover/selection changes instead of a full
 * buffer rebuild (plan §5).
 */
const CuboidColorSync = ({
  label,
  index,
  baseColor,
  bodyMeshRef,
  arrowMeshRef,
  outlineGeometry,
  shaftGeometry,
  showOrientation,
}: CuboidColorSyncProps) => {
  const hoveredLabel = useHoveredLabel3d();
  const isHovered = hoveredLabel?.id === label._id;
  const isSimilarLabelHovered = useSimilarLabels3d(label);
  const isSelectedForAnnotation =
    useCurrentSelected3dAnnotationLabel()?._id === label._id;
  // ReconciledDetection3D's index signature types `selected` as `unknown`
  // (see the same narrowing in ThreeDLabels' cuboidOverlays memo).
  const selected = Boolean((label as { selected?: boolean }).selected);

  const strokeAndFillColor = use3dLabelColor({
    isSelected: selected,
    isHovered,
    isSimilarLabelHovered,
    defaultColor: baseColor,
    isSelectedForAnnotation,
  });

  useLayoutEffect(() => {
    const color = new THREE.Color(strokeAndFillColor);

    const bodyMesh = bodyMeshRef.current;
    if (bodyMesh?.instanceColor) {
      bodyMesh.instanceColor.setXYZ(index, color.r, color.g, color.b);
      bodyMesh.instanceColor.needsUpdate = true;
    }

    const edgeBase = index * EDGES_PER_BOX;
    for (let s = 0; s < EDGES_PER_BOX; s++) {
      setSegmentColor(outlineGeometry, edgeBase + s, color);
    }
    markNeedsUpdate(outlineGeometry);

    if (showOrientation && shaftGeometry) {
      const complementaryColor = new THREE.Color(
        getComplementaryColor(strokeAndFillColor),
      );
      // The axes tripods live in their own geometry and keep the fixed R/G/B
      // colors set at buffer-build time, so only the shaft needs recoloring.
      const shaftBase = index * SHAFT_SEGMENTS_PER_BOX;
      setSegmentColor(shaftGeometry, shaftBase, complementaryColor);
      markNeedsUpdate(shaftGeometry);

      const arrowMesh = arrowMeshRef.current;
      if (arrowMesh?.instanceColor) {
        arrowMesh.instanceColor.setXYZ(
          index,
          complementaryColor.r,
          complementaryColor.g,
          complementaryColor.b,
        );
        arrowMesh.instanceColor.needsUpdate = true;
      }
    }
  }, [
    strokeAndFillColor,
    index,
    bodyMeshRef,
    arrowMeshRef,
    outlineGeometry,
    shaftGeometry,
    showOrientation,
  ]);

  return null;
};

const markNeedsUpdate = (geometry: LineSegmentsGeometry) => {
  const start = geometry.attributes.instanceColorStart as
    | THREE.InterleavedBufferAttribute
    | undefined;
  const end = geometry.attributes.instanceColorEnd as
    | THREE.InterleavedBufferAttribute
    | undefined;
  if (start) start.data.needsUpdate = true;
  if (end) end.data.needsUpdate = true;
};
