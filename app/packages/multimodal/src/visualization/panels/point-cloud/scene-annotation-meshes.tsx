/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type {
  SceneArrowPrimitive,
  SceneCubePrimitive,
  SceneCylinderPrimitive,
  SceneLinePrimitive,
  SceneModelPrimitive,
  SceneSpherePrimitive,
  SceneTrianglePrimitive,
} from "../../../decoders";
import {
  COLOR_COMPONENT_COUNT,
  POINT_COMPONENT_COUNT,
} from "./point-cloud-colors";
import {
  MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION_COMPONENTS,
  applyModelOverrideColor,
  cloneObject3D,
  disposeObject3D,
  loadSceneModelAsset,
  modelAssetForPrimitive,
} from "./scene-models";
import { scenePoseObjectTransform } from "./transforms";
import type { SceneIndexedGeometryRenderData } from "./types";
import {
  isFinitePoint3,
  isFinitePositiveNumber,
  isFinitePositiveVector,
  lineSegmentPairs,
  primitivePointIndices,
  rgbComponents,
  rgbaColorKey,
  sceneMaterialProps,
} from "./utils";

const SCENE_CUBE_WIREFRAME_OPACITY = 0.95;
const SCENE_SURFACE_OPACITY = 0.38;
const SCENE_TRIANGLE_OPACITY = 0.42;
const SCENE_LINE_OPACITY = 0.95;

export function scenePrimitiveKey(
  entityId: string,
  entityIndex: number,
  family: string,
  primitiveIndex: number,
) {
  return `${entityId || entityIndex}:${family}:${primitiveIndex}`;
}

export function SceneArrowMesh({
  arrow,
}: {
  readonly arrow: SceneArrowPrimitive;
}) {
  const shaftRadius = arrow.shaftDiameter / 2;
  const headRadius = arrow.headDiameter / 2;
  const hasShaft =
    Number.isFinite(arrow.shaftLength) &&
    arrow.shaftLength > 0 &&
    Number.isFinite(shaftRadius) &&
    shaftRadius > 0;
  const hasHead =
    Number.isFinite(arrow.headLength) &&
    arrow.headLength > 0 &&
    Number.isFinite(headRadius) &&
    headRadius > 0;

  if (!hasShaft && !hasHead) {
    return null;
  }

  const transform = scenePoseObjectTransform(arrow.pose);
  const material = sceneMaterialProps(arrow.color, SCENE_SURFACE_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      {hasShaft ? (
        <mesh
          frustumCulled={false}
          position={[arrow.shaftLength / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <cylinderGeometry
            args={[shaftRadius, shaftRadius, arrow.shaftLength, 16]}
          />
          <meshBasicMaterial {...material} />
        </mesh>
      ) : null}
      {hasHead ? (
        <mesh
          frustumCulled={false}
          position={[
            Math.max(0, arrow.shaftLength) + arrow.headLength / 2,
            0,
            0,
          ]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <coneGeometry args={[headRadius, arrow.headLength, 16]} />
          <meshBasicMaterial {...material} />
        </mesh>
      ) : null}
    </group>
  );
}

export function SceneCubeMesh({ cube }: { readonly cube: SceneCubePrimitive }) {
  const size = cube.size;
  if (!isFinitePositiveVector(size)) {
    return null;
  }

  const transform = scenePoseObjectTransform(cube.pose);
  const material = sceneMaterialProps(cube.color, SCENE_CUBE_WIREFRAME_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <mesh frustumCulled={false}>
        <boxGeometry args={[size[0], size[1], size[2]]} />
        <meshBasicMaterial {...material} wireframe />
      </mesh>
    </group>
  );
}

export function SceneCylinderMesh({
  cylinder,
}: {
  readonly cylinder: SceneCylinderPrimitive;
}) {
  if (
    !isFinitePositiveVector(cylinder.size) ||
    (!isFinitePositiveNumber(cylinder.bottomScale) &&
      !isFinitePositiveNumber(cylinder.topScale))
  ) {
    return null;
  }

  const transform = scenePoseObjectTransform(cylinder.pose);
  const material = sceneMaterialProps(cylinder.color, SCENE_SURFACE_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <mesh
        frustumCulled={false}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[cylinder.size[0], cylinder.size[2], cylinder.size[1]]}
      >
        <cylinderGeometry
          args={[
            Math.max(0, cylinder.topScale) / 2,
            Math.max(0, cylinder.bottomScale) / 2,
            1,
            24,
          ]}
        />
        <meshBasicMaterial {...material} wireframe />
      </mesh>
    </group>
  );
}

export function SceneLineMesh({ line }: { readonly line: SceneLinePrimitive }) {
  const invalidate = useThree((state) => state.invalidate);
  const renderData = useMemo(() => createSceneLineRenderData(line), [line]);

  useEffect(() => {
    if (!renderData) return;
    invalidate();
    return () => renderData.geometry.dispose();
  }, [invalidate, renderData]);

  if (!renderData) {
    return null;
  }

  const transform = scenePoseObjectTransform(line.pose);
  const material = sceneMaterialProps(line.color, SCENE_LINE_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <lineSegments frustumCulled={false}>
        <primitive attach="geometry" object={renderData.geometry} />
        <lineBasicMaterial
          {...material}
          linewidth={Math.max(1, line.thickness || 1)}
          vertexColors={renderData.usesVertexColors}
        />
      </lineSegments>
    </group>
  );
}

export function SceneModelMesh({
  model,
}: {
  readonly model: SceneModelPrimitive;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const loadedInstanceKeyRef = useRef<string | null>(null);
  const modelData = model.data;
  const modelMediaType = model.mediaType;
  const modelUrl = model.url;
  const modelColorKey =
    model.overrideColor && model.color ? rgbaColorKey(model.color) : "";
  const asset = useMemo(
    () =>
      modelAssetForPrimitive({
        data: modelData,
        mediaType: modelMediaType,
        url: modelUrl,
      }),
    [modelData, modelMediaType, modelUrl],
  );
  const instanceKey = asset
    ? `${asset.cacheKey}|${model.overrideColor ? modelColorKey : "source"}`
    : null;

  useEffect(() => {
    let isActive = true;

    if (!asset || !instanceKey) {
      loadedInstanceKeyRef.current = null;
      setObject(null);
      return;
    }

    if (loadedInstanceKeyRef.current === instanceKey) {
      return;
    }

    loadSceneModelAsset(asset)
      .then((baseObject) => {
        if (!isActive) {
          return;
        }
        const scene = cloneObject3D(baseObject);
        if (model.overrideColor && model.color) {
          applyModelOverrideColor(scene, model.color);
        }
        loadedInstanceKeyRef.current = instanceKey;
        setObject(scene);
        invalidate();
      })
      .catch(() => {
        if (isActive && loadedInstanceKeyRef.current !== instanceKey) {
          setObject(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, [asset, instanceKey, invalidate, model.color, model.overrideColor]);

  useEffect(() => {
    return () => {
      if (object) {
        disposeObject3D(object);
      }
    };
  }, [object]);

  if (!object || !isFinitePositiveVector(model.scale)) {
    return null;
  }

  const transform = scenePoseObjectTransform(model.pose);

  return (
    <group
      position={transform.position}
      quaternion={transform.quaternion}
      scale={model.scale}
    >
      <group quaternion={MODEL_Y_UP_TO_SCENE_Z_UP_QUATERNION_COMPONENTS}>
        <primitive object={object} />
      </group>
    </group>
  );
}

export function SceneSphereMesh({
  sphere,
}: {
  readonly sphere: SceneSpherePrimitive;
}) {
  if (!isFinitePositiveVector(sphere.size)) {
    return null;
  }

  const transform = scenePoseObjectTransform(sphere.pose);
  const material = sceneMaterialProps(sphere.color, SCENE_SURFACE_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <mesh frustumCulled={false} scale={sphere.size}>
        <sphereGeometry args={[0.5, 18, 12]} />
        <meshBasicMaterial {...material} wireframe />
      </mesh>
    </group>
  );
}

function createSceneLineRenderData(
  line: SceneLinePrimitive,
): SceneIndexedGeometryRenderData | null {
  const orderedPointIndices = primitivePointIndices(line.points, line.indices);
  const segmentPairs = lineSegmentPairs(orderedPointIndices, line.type);
  if (segmentPairs.length === 0) {
    return null;
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const usesVertexColors = line.colors.length >= line.points.length;

  for (const [startIndex, endIndex] of segmentPairs) {
    const start = line.points[startIndex];
    const end = line.points[endIndex];
    if (!isFinitePoint3(start) || !isFinitePoint3(end)) {
      continue;
    }

    positions.push(...start, ...end);
    if (usesVertexColors) {
      colors.push(...rgbComponents(line.colors[startIndex]));
      colors.push(...rgbComponents(line.colors[endIndex]));
    }
  }

  if (positions.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(positions),
      POINT_COMPONENT_COUNT,
    ),
  );
  if (usesVertexColors) {
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(
        new Float32Array(colors),
        COLOR_COMPONENT_COUNT,
      ),
    );
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { geometry, usesVertexColors };
}

function createSceneTriangleRenderData(
  triangle: SceneTrianglePrimitive,
): SceneIndexedGeometryRenderData | null {
  const orderedPointIndices = primitivePointIndices(
    triangle.points,
    triangle.indices,
  );
  const trianglePointCount = Math.floor(orderedPointIndices.length / 3) * 3;
  if (trianglePointCount === 0) {
    return null;
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const usesVertexColors = triangle.colors.length >= triangle.points.length;

  for (let index = 0; index < trianglePointCount; index++) {
    const pointIndex = orderedPointIndices[index];
    const point = triangle.points[pointIndex];
    if (!isFinitePoint3(point)) {
      continue;
    }
    positions.push(...point);
    if (usesVertexColors) {
      colors.push(...rgbComponents(triangle.colors[pointIndex]));
    }
  }

  if (positions.length === 0 || positions.length % 9 !== 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(positions),
      POINT_COMPONENT_COUNT,
    ),
  );
  if (usesVertexColors) {
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(
        new Float32Array(colors),
        COLOR_COMPONENT_COUNT,
      ),
    );
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { geometry, usesVertexColors };
}

export function SceneTriangleMesh({
  triangle,
}: {
  readonly triangle: SceneTrianglePrimitive;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const renderData = useMemo(
    () => createSceneTriangleRenderData(triangle),
    [triangle],
  );

  useEffect(() => {
    if (!renderData) return;
    invalidate();
    return () => renderData.geometry.dispose();
  }, [invalidate, renderData]);

  if (!renderData) {
    return null;
  }

  const transform = scenePoseObjectTransform(triangle.pose);
  const material = sceneMaterialProps(triangle.color, SCENE_TRIANGLE_OPACITY);

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <mesh frustumCulled={false}>
        <primitive attach="geometry" object={renderData.geometry} />
        <meshBasicMaterial
          {...material}
          side={THREE.DoubleSide}
          vertexColors={renderData.usesVertexColors}
        />
      </mesh>
    </group>
  );
}
