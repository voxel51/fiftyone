/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";

import {
  SceneArrowMesh,
  SceneCubeMesh,
  SceneCylinderMesh,
  SceneLineMesh,
  SceneModelMesh,
  SceneSphereMesh,
  SceneTriangleMesh,
  scenePrimitiveKey,
} from "./scene-annotation-meshes";
import { SceneTextSprite } from "./scene-text-sprite";
import { pointCloudObjectTransform } from "./transforms";
import type { SceneAnnotationPanelLayer } from "./types";

export function SceneAnnotationLayer({
  layer,
}: {
  readonly layer: SceneAnnotationPanelLayer;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { frameTransform } = layer;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );

  useEffect(() => {
    invalidate();
  }, [invalidate, objectTransform]);

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
    >
      {layer.frame.entities.map((entity, entityIndex) => (
        <group key={entity.id || entityIndex}>
          {entity.arrows.map((arrow, primitiveIndex) => (
            <SceneArrowMesh
              arrow={arrow}
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "arrow",
                primitiveIndex,
              )}
            />
          ))}
          {entity.cubes.map((cube, primitiveIndex) => (
            <SceneCubeMesh
              cube={cube}
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "cube",
                primitiveIndex,
              )}
            />
          ))}
          {entity.cylinders.map((cylinder, primitiveIndex) => (
            <SceneCylinderMesh
              cylinder={cylinder}
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "cylinder",
                primitiveIndex,
              )}
            />
          ))}
          {entity.lines.map((line, primitiveIndex) => (
            <SceneLineMesh
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "line",
                primitiveIndex,
              )}
              line={line}
            />
          ))}
          {entity.models.map((model, primitiveIndex) => (
            <SceneModelMesh
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "model",
                primitiveIndex,
              )}
              model={model}
            />
          ))}
          {entity.spheres.map((sphere, primitiveIndex) => (
            <SceneSphereMesh
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "sphere",
                primitiveIndex,
              )}
              sphere={sphere}
            />
          ))}
          {entity.texts.map((text, primitiveIndex) => (
            <SceneTextSprite
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "text",
                primitiveIndex,
              )}
              textPrimitive={text}
            />
          ))}
          {entity.triangles.map((triangle, primitiveIndex) => (
            <SceneTriangleMesh
              key={scenePrimitiveKey(
                entity.id,
                entityIndex,
                "triangle",
                primitiveIndex,
              )}
              triangle={triangle}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
