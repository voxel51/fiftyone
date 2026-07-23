import { type SetStateAction, useCallback, useMemo, useRef } from "react";
import { type PrimitiveAtom, useStore } from "jotai";

import type { SceneSource } from "../../../../ir";
import { useKeyedIdentityMap } from "../../../../visualization/panel-ui/use-keyed-identity-map";
import type {
  PointCloudPanelLayer,
  PointCloudPointPick,
  SceneAnnotationPanelLayer,
} from "../../../../visualization/scene-3d/types";
import {
  Scene3dHoverTooltip,
  useScene3dHoverTooltip,
} from "../../interaction/point-hover/use-hover-tooltip";
import { hoveredPointForFrame } from "../../interaction/point-hover/point-hover";
import {
  hoverEchoAtom,
  useHoverEcho,
  type HoverEcho,
} from "../../interaction/point-hover/hover-echo";
import {
  entityLabel,
  isLabelEcho,
  isSceneEntitySelected,
  selectedObjectAtom,
  useSelectedObject,
} from "../../interaction/selection/selected-object";
import { frameTransformIdentityInputs } from "../entities/scene-3d-layer-identity";

type SelectedObjectState = ReturnType<typeof useSelectedObject>;

/** Wires scene entities and points into shared selection/hover state. */
export function useScene3dPickingLayers({
  pointCloudLayers,
  pointCloudSources,
  sceneAnnotationLayers,
}: {
  readonly pointCloudLayers: readonly PointCloudPanelLayer[];
  readonly pointCloudSources: readonly SceneSource[];
  readonly sceneAnnotationLayers: readonly SceneAnnotationPanelLayer[];
}) {
  const jotaiStore = useStore();
  const {
    containerProps: hoverTooltipContainerProps,
    onHoverCamera,
    onHoverEntity,
    onHoverPoint,
    tooltip: hoverTooltip,
  } = useScene3dHoverTooltip();
  const selectedObject = useSelectedObject();
  const setSelectedObject = useCallback(
    (update: SetStateAction<SelectedObjectState>) => {
      jotaiStore.set(
        selectedObjectAtom as PrimitiveAtom<SelectedObjectState>,
        update,
      );
    },
    [jotaiStore],
  );
  const annotationLayers = useKeyedIdentityMap(sceneAnnotationLayers, {
    build: (layer) => {
      const entity = layer.frame.entities[0];
      if (!entity) return layer;
      const stream = layer.sourceId ?? "";
      const entityId = entity.id || layer.id;
      const label = entityLabel(entity);
      const hoveredEntity = {
        entityId,
        kind: "entity" as const,
        label,
        metadata: entity.metadata,
        stream,
        texts: entity.texts
          .map((textPrimitive) => textPrimitive.text)
          .filter(Boolean),
      };
      return {
        ...layer,
        highlighted:
          isSceneEntitySelected(selectedObject, stream, entityId) ||
          isLabelEcho(selectedObject, label),
        onHoverEntity: (hoveredId: string | null) =>
          onHoverEntity(hoveredId ? hoveredEntity : null),
        onSelectEntity: (
          _entityId: string,
          modifiers: { readonly shiftKey: boolean },
        ) => {
          setSelectedObject((current) =>
            toggleSceneEntitySelection(
              current,
              entity,
              stream,
              entityId,
              modifiers.shiftKey,
            ),
          );
        },
      };
    },
    inputs: (layer) => {
      const entity = layer.frame.entities[0];
      if (!entity) {
        return [
          layer.frame,
          layer.sourceId,
          ...frameTransformIdentityInputs(layer.frameTransform),
        ];
      }
      const stream = layer.sourceId ?? "";
      const entityId = entity.id || layer.id;
      return [
        entity,
        layer.sourceId,
        ...frameTransformIdentityInputs(layer.frameTransform),
        isSceneEntitySelected(selectedObject, stream, entityId),
        isLabelEcho(selectedObject, entityLabel(entity)),
        onHoverEntity,
        setSelectedObject,
      ];
    },
    key: (layer) => layer.id,
  });

  const hoverEcho = useHoverEcho();
  const pointCloudSourcesById = useMemo(
    () => new Map(pointCloudSources.map((source) => [source.id, source])),
    [pointCloudSources],
  );
  const publishedPointHoverRefs = useRef(new Map<string, HoverEcho>());
  const hoverablePointCloudLayers = useKeyedIdentityMap(pointCloudLayers, {
    build: (layer) => {
      const stream = layer.id;
      const frame = layer.frame;
      const source = pointCloudSourcesById.get(stream);
      return {
        ...layer,
        hoveredPoint:
          hoverEcho?.kind === "point" && hoverEcho.stream === stream
            ? { color: hoverEcho.color, position: hoverEcho.position }
            : null,
        onHoverPoint: (pick: PointCloudPointPick | null) => {
          const hoveredPoint = pick
            ? hoveredPointForFrame(stream, frame, pick.pointIndex)
            : null;
          const payload = hoveredPoint
            ? {
                ...hoveredPoint,
                color: pick?.color ?? null,
                ...(source
                  ? {
                      sourceLabel: source.label,
                      sourceName: source.sourceName,
                    }
                  : {}),
              }
            : null;
          onHoverPoint(payload);
          if (payload && pick) {
            const hover: HoverEcho = {
              color: pick.color,
              kind: "point",
              pointIndex: payload.pointIndex,
              position: payload.position,
              stream,
            };
            publishedPointHoverRefs.current.set(stream, hover);
            jotaiStore.set(hoverEchoAtom, hover);
            return;
          }
          const published = publishedPointHoverRefs.current.get(stream);
          publishedPointHoverRefs.current.delete(stream);
          if (published) {
            jotaiStore.set(hoverEchoAtom, (current) =>
              current === published ? null : current,
            );
          }
        },
      };
    },
    inputs: (layer) => [
      layer,
      hoverEcho?.kind === "point" && hoverEcho.stream === layer.id
        ? hoverEcho
        : null,
      jotaiStore,
      onHoverPoint,
      pointCloudSourcesById.get(layer.id)?.label ?? "",
      pointCloudSourcesById.get(layer.id)?.sourceName ?? "",
    ],
    key: (layer) => layer.id,
  });

  return {
    annotationLayers,
    hoverablePointCloudLayers,
    hoverTooltip,
    hoverTooltipContainerProps,
    onHoverCamera,
  } as const;
}

/** Applies instance- or label-scoped toggling to one picked scene entity. */
export function toggleSceneEntitySelection(
  current: SelectedObjectState,
  entity: SceneAnnotationPanelLayer["frame"]["entities"][number],
  stream: string,
  entityId: string,
  shiftKey: boolean,
): SelectedObjectState {
  const label = entityLabel(entity);
  const scope = shiftKey ? "label" : "instance";
  if (
    isSceneEntitySelected(current, stream, entityId) &&
    current?.scope === scope
  ) {
    return null;
  }
  return {
    entityId,
    frameId: entity.frameId,
    kind: "scene-annotation",
    label,
    metadata: entity.metadata,
    scope,
    stream,
  };
}

export { Scene3dHoverTooltip };
