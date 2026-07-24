import {
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
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
  hoverMatchesPointFrame,
  hoverMatchesSceneEntity,
  useHoverEcho,
  type HoveredPointEcho,
  type HoveredSceneAnnotationEcho,
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
  const hoverEcho = useHoverEcho();
  const publishedEntityHoverRefs = useRef(
    new Map<string, HoveredSceneAnnotationEcho>(),
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
        hovered: hoverMatchesSceneEntity(hoverEcho, stream, entityId),
        onHoverEntity: (hoveredId: string | null) => {
          onHoverEntity(hoveredId ? hoveredEntity : null);
          const published = publishedEntityHoverRefs.current.get(layer.id);
          if (hoveredId) {
            const hover: HoveredSceneAnnotationEcho = {
              entityId: hoveredId,
              kind: "scene-annotation",
              stream,
            };
            publishedEntityHoverRefs.current.set(layer.id, hover);
            jotaiStore.set(hoverEchoAtom, hover);
            return;
          }
          publishedEntityHoverRefs.current.delete(layer.id);
          if (published) {
            jotaiStore.set(hoverEchoAtom, (current) =>
              current === published ? null : current,
            );
          }
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
        jotaiStore,
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
  const publishedPointHoverRefs = useRef(new Map<string, HoveredPointEcho>());
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
      hoverMatchesPointFrame(hoverEcho, layer.id, layer.contentTimeNs)
        ? hoverEcho
        : null,
      jotaiStore,
      onHoverPoint,
      pointCloudSourcesById.get(layer.id)?.label ?? "",
      pointCloudSourcesById.get(layer.id)?.sourceName ?? "",
      worldFrameId,
    ],
    key: (layer) => layer.id,
  });

  // This effect retires hovers published by this 3D surface when playback
  // replaces their immutable point frame without another pointer event.
  useEffect(() => {
    for (const [stream, published] of publishedPointHoverRefs.current) {
      const layer = pointCloudLayers.find(
        (candidate) => candidate.id === stream,
      );
      if (hoverMatchesPointFrame(published, stream, layer?.contentTimeNs)) {
        continue;
      }
      publishedPointHoverRefs.current.delete(stream);
      if (jotaiStore.get(hoverEchoAtom) === published) {
        jotaiStore.set(hoverEchoAtom, null);
        onHoverPoint(null);
      }
    }
  }, [jotaiStore, onHoverPoint, pointCloudLayers]);

  // This effect retires entity hovers published by this 3D pane when
  // lifecycle reconstruction removes their source layer.
  useEffect(() => {
    const currentLayerIds = new Set(
      sceneAnnotationLayers.map((layer) => layer.id),
    );
    for (const [layerId, published] of publishedEntityHoverRefs.current) {
      if (currentLayerIds.has(layerId)) continue;
      publishedEntityHoverRefs.current.delete(layerId);
      if (jotaiStore.get(hoverEchoAtom) === published) {
        jotaiStore.set(hoverEchoAtom, null);
        onHoverEntity(null);
      }
    }
  }, [jotaiStore, onHoverEntity, sceneAnnotationLayers]);

  // This effect clears hovers owned by this 3D pane on unmount. Identity
  // checks preserve a newer hover published by another surface.
  useEffect(
    () => () => {
      const publishedEntities = new Set(
        publishedEntityHoverRefs.current.values(),
      );
      publishedEntityHoverRefs.current.clear();
      const published = new Set(publishedPointHoverRefs.current.values());
      publishedPointHoverRefs.current.clear();
      const current = jotaiStore.get(hoverEchoAtom);
      const ownsEntityHover =
        current?.kind === "scene-annotation" && publishedEntities.has(current);
      const ownsPointHover =
        current?.kind === "point" && published.has(current);
      if (ownsEntityHover || ownsPointHover) {
        jotaiStore.set(hoverEchoAtom, null);
        if (ownsEntityHover) onHoverEntity(null);
        if (ownsPointHover) onHoverPoint(null);
      }
    },
    [jotaiStore, onHoverEntity, onHoverPoint],
  );

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
