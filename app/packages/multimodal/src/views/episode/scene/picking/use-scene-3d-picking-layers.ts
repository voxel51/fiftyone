import { type SetStateAction, useCallback, useEffect, useMemo } from "react";
import { type PrimitiveAtom, useStore } from "jotai";

import type { SceneSource } from "../../../../ir";
import { useKeyedIdentityMap } from "../../../../visualization/panel-ui/use-keyed-identity-map";
import type {
  PointCloudPanelLayer,
  PointCloudPointPick,
  SceneAnnotationPanelLayer,
} from "../../../../visualization/scene-3d/types";
import {
  Scene3dHoverTooltipStack,
  useScene3dHoverTooltip,
} from "../../interaction/point-hover/use-hover-tooltip";
import { hoveredPointForFrame } from "../../interaction/point-hover/point-hover";
import {
  hoverMatchesPointFrame,
  hoverMatchesSceneEntity,
  useHoverEcho,
  useOwnedHoverEchoPublisher,
  type HoveredPointEcho,
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
  worldFrameId,
}: {
  readonly pointCloudLayers: readonly PointCloudPanelLayer[];
  readonly pointCloudSources: readonly SceneSource[];
  readonly sceneAnnotationLayers: readonly SceneAnnotationPanelLayer[];
  readonly worldFrameId: string;
}) {
  const jotaiStore = useStore();
  const {
    containerProps: hoverTooltipContainerProps,
    onHoverCamera,
    onHoverEntity,
    onHoverPoint,
    tooltips: hoverTooltips,
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
  const hoverEcho = useHoverEcho();
  const entityHoverPublisher = useOwnedHoverEchoPublisher<string>();
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
        hovered: hoverMatchesSceneEntity(hoverEcho, stream, entityId),
        onHoverEntity: (hoveredId: string | null) => {
          onHoverEntity(layer.id, hoveredId ? hoveredEntity : null);
          if (hoveredId) {
            entityHoverPublisher.publish(layer.id, {
              entityId: hoveredId,
              kind: "scene-annotation",
              stream,
            });
            return;
          }
          entityHoverPublisher.retract(layer.id);
        },
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
        hoverMatchesSceneEntity(hoverEcho, stream, entityId),
        entityHoverPublisher,
        onHoverEntity,
        setSelectedObject,
      ];
    },
    key: (layer) => layer.id,
  });

  const pointCloudSourcesById = useMemo(
    () => new Map(pointCloudSources.map((source) => [source.id, source])),
    [pointCloudSources],
  );
  const pointHoverPublisher = useOwnedHoverEchoPublisher<string>();
  const hoverablePointCloudLayers = useKeyedIdentityMap(pointCloudLayers, {
    build: (layer) => {
      const stream = layer.id;
      const frame = layer.frame;
      const source = pointCloudSourcesById.get(stream);
      return {
        ...layer,
        hoveredPoint:
          hoverMatchesPointFrame(hoverEcho, stream, layer.contentTimeNs) &&
          hoverEcho.source?.kind !== "image-projection"
            ? { color: hoverEcho.color, position: hoverEcho.position }
            : null,
        onHoverPoint: (pick: PointCloudPointPick | null) => {
          const hoveredPoint = pick
            ? hoveredPointForFrame(
                stream,
                frame,
                pick.pointIndex,
                pick.sampleIndex,
              )
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
          if (payload && pick && layer.contentTimeNs !== undefined) {
            const hasResolvedWorldPosition =
              (layer.frameTransform?.targetFrameId === worldFrameId ||
                (!layer.frameTransform &&
                  frame.coordinateFrameId === worldFrameId)) &&
              pick.worldPosition.every(Number.isFinite);
            const hover: HoveredPointEcho = {
              color: pick.color,
              contentTimeNs: layer.contentTimeNs,
              fields: payload.fields,
              ...(payload.frameId ? { frameId: payload.frameId } : {}),
              kind: "point",
              pointIndex: payload.pointIndex,
              position: payload.position,
              ...(payload.sourceLabel
                ? { sourceLabel: payload.sourceLabel }
                : {}),
              ...(payload.sourceName ? { sourceName: payload.sourceName } : {}),
              stream,
              ...(hasResolvedWorldPosition
                ? {
                    worldFrameId,
                    worldPosition: pick.worldPosition,
                  }
                : {}),
            };
            pointHoverPublisher.publish(stream, hover);
            return;
          }
          pointHoverPublisher.retract(stream);
        },
      };
    },
    inputs: (layer) => [
      layer,
      hoverMatchesPointFrame(hoverEcho, layer.id, layer.contentTimeNs)
        ? hoverEcho
        : null,
      onHoverPoint,
      pointHoverPublisher,
      pointCloudSourcesById.get(layer.id)?.label ?? "",
      pointCloudSourcesById.get(layer.id)?.sourceName ?? "",
      worldFrameId,
    ],
    key: (layer) => layer.id,
  });

  // This effect retires hovers published by this 3D surface when playback
  // replaces their immutable point frame without another pointer event.
  useEffect(() => {
    const retired = pointHoverPublisher.retire((stream, published) => {
      const layer = pointCloudLayers.find(
        (candidate) => candidate.id === stream,
      );
      return !hoverMatchesPointFrame(published, stream, layer?.contentTimeNs);
    });
    if (retired.some(({ cleared }) => cleared)) {
      onHoverPoint(null);
    }
  }, [onHoverPoint, pointCloudLayers, pointHoverPublisher]);

  // This effect retires entity hovers published by this 3D pane when
  // lifecycle reconstruction removes their source layer.
  useEffect(() => {
    const currentLayerIds = new Set(
      sceneAnnotationLayers.map((layer) => layer.id),
    );
    const retired = entityHoverPublisher.retire(
      (layerId) => !currentLayerIds.has(layerId),
    );
    for (const { key: layerId } of retired) {
      onHoverEntity(layerId, null);
    }
  }, [entityHoverPublisher, onHoverEntity, sceneAnnotationLayers]);

  // This effect clears hovers owned by this 3D pane on unmount. Identity
  // checks preserve a newer hover published by another surface.
  useEffect(
    () => () => {
      const retiredEntities = entityHoverPublisher.disownAll();
      const retiredPoints = pointHoverPublisher.disownAll();
      if (retiredPoints.some(({ cleared }) => cleared)) {
        onHoverPoint(null);
      }
      for (const { key: layerId } of retiredEntities) {
        onHoverEntity(layerId, null);
      }
    },
    [entityHoverPublisher, onHoverEntity, onHoverPoint, pointHoverPublisher],
  );

  return {
    annotationLayers,
    hoverablePointCloudLayers,
    hoverTooltips,
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

export { Scene3dHoverTooltipStack };
