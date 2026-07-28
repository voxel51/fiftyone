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
import { useFo3dContext } from "../fo3d/context";
import { use3dLabelColor } from "../hooks/use-3d-label-color";
import { useSimilarLabels3d } from "../hooks/use-similar-labels-3d";
import {
  useCurrentSelected3dAnnotationLabel,
  useHoveredLabel3d,
  useSetHoveredLabel3d,
} from "../state";
import type { HoveredLabelSource } from "../types";
import { getComplementaryColor } from "../utils";
import {
  EDGES_PER_BOX,
  SHAFT_SEGMENTS_PER_BOX,
  UNIT_ARROWHEAD_GEOMETRY,
  UNIT_BOX_GEOMETRY,
  ZERO_SCALE_MATRIX,
  computeArrowheadMatrix,
  computeBodyMatrix,
  computeBoxEdgePositions,
  localToWorld,
  orientationSegmentsPerBoxFor,
  resolveCuboidGeometry,
  setSegmentColor,
} from "./cuboid-instance-geometry";
import {
  ORIENTATION_AXES_COLORS,
  ORIENTATION_AXES_LENGTH_RATIO,
  ORIENTATION_AXES_MIN_LENGTH,
  getCuboidOrientationMarkerGeometry,
  getFiniteMagnitude,
} from "./shared/cuboid-orientation-geometry";
import { useEventHandlers } from "./shared/hooks";
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
  const { upVector } = useFo3dContext();
  const hoveredLabel = useHoveredLabel3d();
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
  // Orientation markers (shaft + axes) live in their own merged geometry,
  // separate from the edge outline above: they need `depthTest: false` (see
  // `orientationMaterial` below), which would be wrong for edges.
  const [orientationGeometry, setOrientationGeometry] =
    useState<LineSegmentsGeometry | null>(null);
  const previousOrientationGeometryRef = useRef<LineSegmentsGeometry | null>(
    null,
  );

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
  const arrowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthTest: false,
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
  // Mirrors the standalone `CuboidOrientationMarkers`' `depthTest={false}`
  // Lines: the shaft + axes run from the box's *center* outward but only to
  // `ORIENTATION_AXES_LENGTH_RATIO` (< 1) of the half-dimension, so they
  // never reach the surface — with normal depth testing they'd always be
  // buried behind the box's own opaque front face and never render.
  const orientationMaterial = useMemo(
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
      orientationMaterial.dispose();
    };
  }, [bodyMaterial, arrowMaterial, outlineMaterial, orientationMaterial]);

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
  const orientationSegmentsPerBox =
    orientationSegmentsPerBoxFor(showOrientation);

  // Rebuild every buffer when membership or batch-level rendering settings
  // change. Per-label *color* changes (hover/select/similar/color-by-mode)
  // are handled reactively by `CuboidColorSync` below instead of here — this
  // effect only needs to re-run for structural changes.
  useLayoutEffect(() => {
    if (count === 0) {
      setOutlineGeometry(null);
      setOrientationGeometry(null);
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

    // Orientation markers (shaft + axes) — zero-length arrays when
    // `showOrientation` is off.
    const orientationPositions = new Float32Array(
      count * orientationSegmentsPerBox * 6,
    );
    const orientationColors = new Float32Array(
      count * orientationSegmentsPerBox * 6,
    );

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
        geometry.quaternion,
        upVector,
      );
      const complementaryColor = new THREE.Color(
        getComplementaryColor(getColor(labelsByIndex[i])),
      );

      const orientationFloatBase = i * orientationSegmentsPerBox * 6;
      const shaftFloatBase = orientationFloatBase;
      if (markerGeometry) {
        const shaftStartWorld = localToWorld(
          markerGeometry.shaftStart,
          geometry,
        );
        const shaftEndWorld = localToWorld(markerGeometry.anchor, geometry);
        orientationPositions.set(
          [...shaftStartWorld, ...shaftEndWorld],
          shaftFloatBase,
        );
      }
      orientationColors.set(
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
        markerGeometry
          ? computeArrowheadMatrix(geometry, upVector)
          : ZERO_SCALE_MATRIX,
      );

      const axesFloatBase = shaftFloatBase + SHAFT_SEGMENTS_PER_BOX * 6;
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
      const axesColors = [
        ORIENTATION_AXES_COLORS.x,
        ORIENTATION_AXES_COLORS.y,
        ORIENTATION_AXES_COLORS.z,
      ];
      const originWorld = localToWorld([0, 0, 0], geometry);
      axesLocalEnds.forEach((localEnd, axis) => {
        const endWorld = localToWorld(localEnd, geometry);
        const o = axesFloatBase + axis * 6;
        orientationPositions.set([...originWorld, ...endWorld], o);
        const axisColor = new THREE.Color(axesColors[axis]);
        orientationColors.set(
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
      const nextOrientationGeometry = new LineSegmentsGeometry();
      nextOrientationGeometry.setPositions(orientationPositions);
      nextOrientationGeometry.setColors(orientationColors);
      previousOrientationGeometryRef.current?.dispose();
      previousOrientationGeometryRef.current = nextOrientationGeometry;
      setOrientationGeometry(nextOrientationGeometry);
    } else {
      previousOrientationGeometryRef.current?.dispose();
      previousOrientationGeometryRef.current = null;
      setOrientationGeometry(null);
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
    orientationSegmentsPerBox,
    useLegacyCoordinates,
    overlayRotationFallback,
    showOrientation,
    upVector,
  ]);

  // Dispose the last-built geometries on unmount.
  useEffect(() => {
    return () => {
      previousOutlineGeometryRef.current?.dispose();
      previousOrientationGeometryRef.current?.dispose();
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
      instanceId === undefined ? null : (labelsByIndex[instanceId] ?? null),
    [labelsByIndex],
  );

  // r3f doesn't guarantee `instanceId` on an InstancedMesh's pointer-out
  // event, so track which instance is currently hovered ourselves and
  // resolve the outgoing label from that on pointer-out.
  const hoveredIndexRef = useRef<number | null>(null);

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (hoverSource === PANEL_ID_MAIN && e.nativeEvent.buttons !== 0) return;
      const label = resolveLabel(e.instanceId);
      if (!label) return;

      hoveredIndexRef.current = e.instanceId ?? null;
      setHoveredLabel({ id: label._id, source: hoverSource });
      onPointerOverForLabel(label, e);
    },
    [resolveLabel, hoverSource, setHoveredLabel, onPointerOverForLabel],
  );

  const handlePointerOut = useCallback(() => {
    const label =
      hoveredIndexRef.current !== null
        ? (labelsByIndex[hoveredIndexRef.current] ?? null)
        : null;
    hoveredIndexRef.current = null;

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
        // @ts-ignore — registered via ./shared/registerLineElements
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
      {orientationGeometry && (
        // @ts-ignore — registered via ./shared/registerLineElements
        <lineSegments2
          geometry={orientationGeometry}
          material={orientationMaterial}
          // Matches the standalone `CuboidOrientationMarkers`' renderOrder;
          // `depthTest: false` on `orientationMaterial` is what actually
          // keeps these visible through the box body, this just keeps draw
          // order consistent with the standalone path.
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
            orientationGeometry={orientationGeometry}
            orientationSegmentsPerBox={orientationSegmentsPerBox}
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
  orientationGeometry: LineSegmentsGeometry | null;
  orientationSegmentsPerBox: number;
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
  orientationGeometry,
  orientationSegmentsPerBox,
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

    if (showOrientation && orientationGeometry) {
      const complementaryColor = new THREE.Color(
        getComplementaryColor(strokeAndFillColor),
      );
      // Shaft is always the first segment within this label's slice of the
      // orientation buffer; the 3 axes segments after it keep their fixed
      // R/G/B colors set at buffer-build time and don't need updating here.
      const orientationBase = index * orientationSegmentsPerBox;
      setSegmentColor(orientationGeometry, orientationBase, complementaryColor);
      markNeedsUpdate(orientationGeometry);

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
    orientationGeometry,
    orientationSegmentsPerBox,
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
