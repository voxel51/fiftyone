/* eslint-disable react/no-unknown-property */
import { type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import type { SceneEntityVisualization } from "../../ir";
import { CLICK_DRAG_TOLERANCE_PX } from "../interaction/interaction";
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
import { POINT_PICK_BLOCKING_USER_DATA } from "./point-picking";
import { SceneEmphasisContext, type SceneEmphasis } from "./scene-emphasis";
import { useScenePicking } from "./scene-interactivity";
import { SceneTextSprite } from "./SceneTextSprite";
import { pointCloudObjectTransform } from "./transforms";
import type { SceneAnnotationPanelLayer } from "./types";
import { useInvalidateOn } from "./use-invalidate-on";

/**
 * Renders one memoized scene-annotation layer in its source-frame transform.
 * Stable layer identities keep unrelated annotation layers from rerendering.
 */
export const SceneAnnotationLayer = memo(function SceneAnnotationLayer({
  layer,
  renderCubes = true,
}: {
  readonly layer: SceneAnnotationPanelLayer;
  readonly renderCubes?: boolean;
}) {
  const { frameTransform } = layer;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );

  useInvalidateOn([objectTransform]);

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
    >
      {layer.frame.entities.map((entity, entityIndex) => (
        <SceneAnnotationEntity
          key={entity.id || entityIndex}
          entity={entity}
          entityIndex={entityIndex}
          highlighted={Boolean(layer.highlighted)}
          onHoverEntity={layer.onHoverEntity}
          onSelectEntity={layer.onSelectEntity}
          renderCubes={renderCubes}
        />
      ))}
    </group>
  );
});

function SceneAnnotationEntity({
  entity,
  entityIndex,
  highlighted,
  onHoverEntity,
  onSelectEntity,
  renderCubes,
}: {
  readonly entity: SceneEntityVisualization;
  readonly entityIndex: number;
  readonly highlighted: boolean;
  readonly onHoverEntity?: (entityId: string | null) => void;
  readonly onSelectEntity?: (
    entityId: string,
    modifiers: { readonly shiftKey: boolean },
  ) => void;
  readonly renderCubes: boolean;
}) {
  const pickingEnabled = useScenePicking();
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(hovered);
  hoveredRef.current = hovered;
  const onHoverEntityRef = useRef(onHoverEntity);
  onHoverEntityRef.current = onHoverEntity;
  const interactive =
    Boolean(onSelectEntity || onHoverEntity) && pickingEnabled;
  const entityId = entity.id || String(entityIndex);
  // Selection (or cross-tile echo) outranks hover: selected entities draw
  // dashed, hovered ones draw solid in the emphasis color.
  const emphasis: SceneEmphasis = highlighted
    ? "selected"
    : hovered && interactive
      ? "hover"
      : "none";

  useInvalidateOn([emphasis]);

  // This effect clears an active entity hover when the entity unmounts before
  // its pointer-out handler can run.
  useEffect(
    () => () => {
      if (hoveredRef.current) {
        hoveredRef.current = false;
        onHoverEntityRef.current?.(null);
      }
    },
    [],
  );

  // This effect drops a stale hover when picking is disabled mid-hover
  // (the pointer-out handler is gone by then).
  useEffect(() => {
    if (!interactive && hovered) {
      hoveredRef.current = false;
      setHovered(false);
      onHoverEntity?.(null);
    }
  }, [hovered, interactive, onHoverEntity]);

  // This effect shows a pointer cursor while a pickable entity is
  // hovered; the canvas has no per-object cursor styling of its own.
  useEffect(() => {
    if (!hovered) return undefined;
    const previous = document.body.style.cursor;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = previous;
    };
  }, [hovered]);

  const handleClick =
    interactive && onSelectEntity
      ? (event: ThreeEvent<MouseEvent>) => {
          if (event.delta > CLICK_DRAG_TOLERANCE_PX) return;
          event.stopPropagation();
          onSelectEntity(entityId, {
            shiftKey: event.nativeEvent.shiftKey,
          });
        }
      : undefined;
  const handlePointerOver = interactive
    ? (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        hoveredRef.current = true;
        setHovered(true);
        onHoverEntity?.(entityId);
      }
    : undefined;
  const handlePointerOut = interactive
    ? () => {
        hoveredRef.current = false;
        setHovered(false);
        onHoverEntity?.(null);
      }
    : undefined;

  return (
    <group
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      userData={interactive ? POINT_PICK_BLOCKING_USER_DATA : undefined}
    >
      <SceneEmphasisContext.Provider value={emphasis}>
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
        {renderCubes
          ? entity.cubes.map((cube, primitiveIndex) => (
              <SceneCubeMesh
                cube={cube}
                key={scenePrimitiveKey(
                  entity.id,
                  entityIndex,
                  "cube",
                  primitiveIndex,
                )}
              />
            ))
          : null}
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
      </SceneEmphasisContext.Provider>
    </group>
  );
}
