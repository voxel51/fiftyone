/* eslint-disable react/no-unknown-property */
import { useMemo, useState } from "react";
import * as THREE from "three";

import type {
  SceneUpdateCube,
  SceneUpdateEntity,
  SceneUpdateVisualization,
} from "../../decoders";

export interface SceneUpdatePickedEntity {
  readonly key: string;
  readonly entityId: string;
  readonly cubeIndex: number;
  readonly entity: SceneUpdateEntity;
  readonly cube: SceneUpdateCube;
  readonly color: string;
  readonly label: string | null;
}

export interface SceneUpdateBoxesProps {
  readonly visualization: SceneUpdateVisualization;
  /**
   * 4x4 column-major transform applied to every entity before its own
   * pose. Use this to map entities from their authoring frame (e.g.
   * `"map"`) into the surrounding scene's frame (e.g. lidar). When
   * null, entities render at their native positions.
   */
  readonly worldMatrix?: Float32Array | null;
  readonly selectedKey?: string | null;
  readonly onSelectPrimitive?: (picked: SceneUpdatePickedEntity) => void;
}

/**
 * Renders the cubes of a decoded `foxglove.SceneUpdate` as wireframe
 * boxes inside the surrounding R3F scene. Each entity gets its own
 * group keyed by its stable id; hover and selection use that id, so
 * highlights persist across messages without any spatial matching.
 */
export function SceneUpdateBoxes({
  visualization,
  worldMatrix,
  selectedKey,
  onSelectPrimitive,
}: SceneUpdateBoxesProps) {
  const worldMat = useMemo(() => {
    if (!worldMatrix) return null;
    const m = new THREE.Matrix4();
    m.fromArray(worldMatrix);
    return m;
  }, [worldMatrix]);

  const cubes = useMemo(() => collectCubes(visualization), [visualization]);

  return (
    // Foxglove uses Z-up; the surrounding lidar scene renders raw XYZ
    // into Three.js's Y-up world, so the cuboids would otherwise stand
    // on their sides. Rotate the whole overlay -90° around X so the
    // boxes (positions + orientations) match the lidar's rendering.
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <group
        matrixAutoUpdate={false}
        matrix={worldMat ?? IDENTITY_MATRIX}
      >
        {cubes.map((c) => (
          <CubeOverlay
            key={c.key}
            entity={c.entity}
            cube={c.cube}
            cubeIndex={c.cubeIndex}
            selected={selectedKey === c.key}
            onSelect={onSelectPrimitive}
          />
        ))}
      </group>
    </group>
  );
}

interface CollectedCube {
  readonly key: string;
  readonly entity: SceneUpdateEntity;
  readonly cube: SceneUpdateCube;
  readonly cubeIndex: number;
}

function collectCubes(viz: SceneUpdateVisualization): readonly CollectedCube[] {
  const out: CollectedCube[] = [];
  for (const entity of viz.entities) {
    for (let i = 0; i < entity.cubes.length; i++) {
      out.push({
        key: cubeKey(entity.id, i),
        entity,
        cube: entity.cubes[i],
        cubeIndex: i,
      });
    }
  }
  return out;
}

function cubeKey(entityId: string, cubeIndex: number): string {
  return `${entityId}#${cubeIndex}`;
}

interface CubeOverlayProps {
  readonly entity: SceneUpdateEntity;
  readonly cube: SceneUpdateCube;
  readonly cubeIndex: number;
  readonly selected: boolean;
  readonly onSelect?: (picked: SceneUpdatePickedEntity) => void;
}

const HOVER_STROKE = "#ff7a18";

function CubeOverlay({
  entity,
  cube,
  cubeIndex,
  selected,
  onSelect,
}: CubeOverlayProps) {
  const [hovered, setHovered] = useState(false);
  const label = labelOf(entity);
  const baseColor = colorForLabel(label ?? entity.id);
  const highlight = selected || hovered;
  const strokeColor = highlight ? HOVER_STROKE : baseColor;

  const position = cube.position as readonly [number, number, number];
  const orientation = cube.orientation as readonly [
    number,
    number,
    number,
    number,
  ];
  const size = cube.size as readonly [number, number, number];

  const key = cubeKey(entity.id, cubeIndex);
  const handleClick = onSelect
    ? (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onSelect({
          key,
          entityId: entity.id,
          cubeIndex,
          entity,
          cube,
          color: baseColor,
          label,
        });
      }
    : undefined;

  // BoxGeometry is unit-sized; we scale to the cube's size. Edges
  // geometry is built once per render pass — fine at this scale.
  return (
    <group
      position={[position[0], position[1], position[2]]}
      quaternion={[
        orientation[0],
        orientation[1],
        orientation[2],
        orientation[3],
      ]}
      scale={[
        Math.max(0.001, size[0]),
        Math.max(0.001, size[1]),
        Math.max(0.001, size[2]),
      ]}
    >
      <mesh
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[unitBoxGeometry]} />
        <lineBasicMaterial
          color={strokeColor}
          linewidth={highlight ? 2 : 1}
          transparent
          opacity={highlight ? 1 : 0.95}
          depthTest
        />
      </lineSegments>
    </group>
  );
}

// Shared unit box geometry feeds edgesGeometry for every cube; the
// per-cube scale handles size.
const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

const IDENTITY_MATRIX = new THREE.Matrix4();

function labelOf(entity: SceneUpdateEntity): string | null {
  return (
    entity.metadata["category"] ??
    entity.metadata["class"] ??
    entity.metadata["label"] ??
    null
  );
}

// ---------------------------------------------------------------------------
// Label → palette color (mirrors the image-annotations overlay so the same
// label class gets the same color on both surfaces).
// ---------------------------------------------------------------------------

const DEFAULT_COLOR_POOL: readonly string[] = [
  "#ee0000",
  "#999900",
  "#009900",
  "#003300",
  "#009999",
  "#000099",
  "#0066ff",
  "#6600ff",
  "#cc33cc",
  "#777799",
];

const labelColorAssignments = new Map<string, string>();
const DEFAULT_LABEL_KEY = "__no-label__";

function colorForLabel(label: string | null): string {
  const key = label ?? DEFAULT_LABEL_KEY;
  let color = labelColorAssignments.get(key);
  if (!color) {
    color =
      DEFAULT_COLOR_POOL[
        labelColorAssignments.size % DEFAULT_COLOR_POOL.length
      ];
    labelColorAssignments.set(key, color);
  }
  return color;
}
