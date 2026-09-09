import { activeLabelSchemas } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/state";
import useExit from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useExit";
import {
  FO_LABEL_TOGGLED_EVENT,
  LabelToggledEvent,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import {
  getLabelColor,
  shouldShowLabelTag,
} from "@fiftyone/looker/src/overlays/util";
import * as fop from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { fieldSchema } from "@fiftyone/state";
import { useOnShiftClickLabel } from "@fiftyone/state/src/hooks/useOnShiftClickLabel";
import { ThreeEvent } from "@react-three/fiber";
import { useAtomValue } from "jotai";
import { folder, useControls } from "leva";
import { get as _get } from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { Euler, Quaternion, type Vector3Tuple, type Vector4Tuple } from "three";
import { useIsWorkingInitialized, useRenderModel } from "../annotation/store";
import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "../annotation/types";
import {
  ANNOTATION_CUBOID,
  ANNOTATION_POLYLINE,
  DRAG_GATE_THRESHOLD_PX,
  PANEL_ORDER_LABELS,
  PANEL_ID_MAIN,
  UNFOCUSED_LABEL_OPACITY,
} from "../constants";
import { usePathFilter, useSelect3DLabelForAnnotation } from "../hooks";
import { type Looker3dSettings, defaultPluginSettings } from "../settings";
import { useThreeDLabelState } from "../state";
import { useFo3dContext } from "../fo3d/context";
import { isDetection3dOverlay, isPolyline3dOverlay } from "../types";
import type { Archetype3d, PanelId } from "../types";
import { toEulerFromDegreesArray } from "../utils";
import { Cuboid } from "./cuboid";
import { CuboidInstances } from "./CuboidInstances";
import { DragGate3D } from "./DragGate3D";
import { type OverlayLabel, load3dOverlays } from "./loader";
import { partitionCuboidsByEditedLabel } from "./partition-cuboids";
import { Polyline } from "./polyline";
import { WorkingStoreManager } from "./WorkingStoreManager";

// Fallback overlay color used when an existing label has no resolved string
// color (e.g. coloring metadata is missing/non-string). Newly created labels
// take their color from getLabelColor instead.
const DEFAULT_OVERLAY_COLOR = "#ffffff";
const NATIVE_CUBOID_BATCH = Symbol("native-cuboid-batch");

const composeParentWorldQuaternion = (
  nativeToWorldQuaternion: Vector4Tuple | undefined,
  overlayRotation: Vector3Tuple,
): Vector4Tuple =>
  new Quaternion(...(nativeToWorldQuaternion ?? [0, 0, 0, 1]))
    .multiply(new Quaternion().setFromEuler(new Euler(...overlayRotation)))
    .normalize()
    .toArray();

export interface ThreeDLabelsProps {
  sampleMap: Parameters<typeof load3dOverlays>[0];
  globalOpacity?: number;
  isMainPanel?: boolean;
  panelId?: PanelId;
  dimAllLabels?: boolean;
  unfocusedLabelOpacity?: number;
}

export const ThreeDLabels = ({
  sampleMap,
  globalOpacity,
  isMainPanel = true,
  panelId,
  dimAllLabels = false,
  unfocusedLabelOpacity,
}: ThreeDLabelsProps) => {
  const mode = fos.useModalMode();
  const { directPcdWorldTransformsBySampleId } = useFo3dContext();
  const schema = useRecoilValue(fieldSchema({ space: fos.State.SPACE.SAMPLE }));
  const annotationSchemas = useAtomValue(activeLabelSchemas);
  const { coloring, selectedLabelTags, customizeColorSetting, labelTagColors } =
    useRecoilValue(fos.lookerOptions({ withFilter: true, modal: true }));
  const {
    cuboidLineWidth,
    hoveredLabel,
    isCreatingCuboid,
    isSegmenting,
    polylineWidth,
    selectedLabelForAnnotation,
    setCuboidLineWidth,
    setPolylineWidth,
    showCuboidOrientation,
  } = useThreeDLabelState();

  const settings = fop.usePluginSettings<Looker3dSettings>(
    "3d",
    defaultPluginSettings,
  );
  const onSelectLabel = fos.useOnSelectLabel();
  const pathFilter = usePathFilter();
  const colorScheme = useRecoilValue(fos.colorScheme);
  const selectedLabels = useRecoilValue(fos.selectedLabelMap);
  const labelAlpha = globalOpacity ?? colorScheme.opacity;
  const hoverSource = panelId ?? (isMainPanel ? PANEL_ID_MAIN : undefined);
  const onExit = useExit();

  const select3DLabelForAnnotation = useSelect3DLabelForAnnotation();

  const labelLevaControls = {
    cuboidLineWidget: {
      value: cuboidLineWidth,
      min: 0,
      max: 20,
      step: 1,
      label: `Cuboid Line Width`,
      onChange: (value: number) => {
        setCuboidLineWidth(value);
      },
    },
    polylineLineWidget: {
      value: polylineWidth,
      min: 0,
      max: 20,
      step: 1,
      label: `Polyline Line Width`,
      onChange: (value: number) => {
        setPolylineWidth(value);
      },
    },
  };

  useControls(
    () => ({
      Labels: folder(labelLevaControls, {
        order: PANEL_ORDER_LABELS,
        collapsed: true,
      }),
    }),
    [setCuboidLineWidth, setPolylineWidth],
  );

  const handleSelect = useCallback(
    (
      label: OverlayLabel,
      archetype: Archetype3d,
      e: ThreeEvent<MouseEvent>,
    ) => {
      if (isSegmenting) return;
      if (mode === fos.ModalMode.ANNOTATE) {
        select3DLabelForAnnotation(
          { _id: label.data._id, path: label.path },
          archetype,
        );
        return;
      }

      onSelectLabel({
        detail: {
          id: label.data._id,
          field: label.path,
          sampleId: label.sampleId,
          instanceId: label.data.instance?._id,
          isShiftPressed: e.shiftKey,
        },
      });
    },
    [onSelectLabel, mode, select3DLabelForAnnotation, isSegmenting],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (
        event.key === "Escape" &&
        mode === fos.ModalMode.ANNOTATE &&
        selectedLabelForAnnotation
      ) {
        onExit();

        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handler);

    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [onExit, mode, selectedLabelForAnnotation]);

  const [overlayRotation, itemRotation] = useMemo(
    () => [
      toEulerFromDegreesArray(_get(settings, "overlay.rotation", [0, 0, 0])),
      toEulerFromDegreesArray(
        _get(settings, "overlay.itemRotation", [0, 0, 0]),
      ),
    ],
    [settings],
  );

  // Load raw overlays from sample data (for both explore and annotate modes)
  const rawOverlays = useMemo(
    () =>
      (load3dOverlays(sampleMap, selectedLabels, [], schema) ?? [])
        .map((l) => {
          const path = l.path;
          const isTagged = shouldShowLabelTag(selectedLabelTags, l.data.tags);
          const color = getLabelColor({
            coloring,
            path,
            isTagged,
            labelTagColors,
            customizeColorSetting,
            label: l.data,
            embeddedDocType: l.data._cls,
          });

          return { ...l, ui: { ...l.ui, color } };
        })
        .filter((l) => {
          if (!pathFilter(l.path, l.data)) {
            return false;
          }

          // In annotate mode, only show fields that exist in annotation schemas
          if (mode === fos.ModalMode.ANNOTATE) {
            const isInAnnotationSchemas = Boolean(
              annotationSchemas?.includes(l.path),
            );

            if (!isInAnnotationSchemas) {
              return false;
            }
          }

          return true;
        }),
    [
      coloring,
      pathFilter,
      sampleMap,
      selectedLabels,
      schema,
      selectedLabelTags,
      labelTagColors,
      customizeColorSetting,
      mode,
      annotationSchemas,
    ],
  );

  // Working store management hooks run only in main panel
  const workingStoreManager = isMainPanel ? (
    <WorkingStoreManager rawOverlays={rawOverlays} />
  ) : null;

  // Combine working store with transient overlays to get render view model
  const renderModel = useRenderModel();
  const isWorkingInitialized = useIsWorkingInitialized();

  // Determine which labels to render based on mode
  const { detectionsToRender, polylinesToRender } = useMemo(() => {
    if (mode === fos.ModalMode.ANNOTATE && isWorkingInitialized) {
      return {
        detectionsToRender: renderModel.detections,
        polylinesToRender: renderModel.polylines,
      };
    }

    // In explore mode or before working store is initialized, use baseline / raw overlays
    const detections: ReconciledDetection3D[] = [];
    const polylines: ReconciledPolyline3D[] = [];

    for (const overlay of rawOverlays) {
      if (isDetection3dOverlay(overlay)) {
        detections.push(overlay);
      } else if (isPolyline3dOverlay(overlay)) {
        polylines.push(overlay);
      }
    }

    return {
      detectionsToRender: detections,
      polylinesToRender: polylines,
    };
  }, [mode, isWorkingInitialized, renderModel, rawOverlays]);

  const getOverlayColor = useCallback(
    (overlay: ReconciledDetection3D | ReconciledPolyline3D) => {
      if (overlay.ui.isNew) {
        return getLabelColor({
          coloring,
          path: overlay.path,
          isTagged: false,
          labelTagColors,
          customizeColorSetting,
          label: overlay.data,
          embeddedDocType: overlay.data._cls,
        });
      }

      return typeof overlay.ui.color === "string"
        ? overlay.ui.color
        : DEFAULT_OVERLAY_COLOR;
    },
    [coloring, labelTagColors, customizeColorSetting],
  );
  const shouldDimLabelsForCreation =
    !isMainPanel && mode === fos.ModalMode.ANNOTATE && isCreatingCuboid;
  const effectiveUnfocusedLabelOpacity =
    unfocusedLabelOpacity ??
    (shouldDimLabelsForCreation ? UNFOCUSED_LABEL_OPACITY : undefined);
  const shouldDimAllLabels = dimAllLabels || shouldDimLabelsForCreation;

  const focusedLabelIds = useMemo(() => {
    if (effectiveUnfocusedLabelOpacity === undefined) {
      return null;
    }

    if (shouldDimAllLabels) {
      return new Set<string>();
    }

    const labelIds = new Set<string>();

    if (hoveredLabel?.id) {
      labelIds.add(hoveredLabel.id);
    }

    if (selectedLabelForAnnotation?._id) {
      labelIds.add(selectedLabelForAnnotation._id);
    }

    return labelIds.size > 0 ? labelIds : null;
  }, [
    effectiveUnfocusedLabelOpacity,
    hoveredLabel?.id,
    selectedLabelForAnnotation?._id,
    shouldDimAllLabels,
  ]);

  const getOverlayOpacity = useCallback(
    (labelId: string) => {
      if (!focusedLabelIds || focusedLabelIds.has(labelId)) {
        return labelAlpha;
      }

      return effectiveUnfocusedLabelOpacity ?? labelAlpha;
    },
    [effectiveUnfocusedLabelOpacity, focusedLabelIds, labelAlpha],
  );

  // The single label actively being edited (if any) keeps its full
  // interactive standalone path (TransformControls, face-resize handles,
  // orientation markers) unchanged; every other label renders through the
  // batched CuboidInstances path. Both arrays derive from the same
  // detectionsToRender read in the same render, so a box popping between the
  // two paths lands at the identical transform in the same commit — no
  // flicker or jump (see the looker3dInstanceMesh plan, §7).
  const editedLabelId = selectedLabelForAnnotation?._id;
  const { standaloneDetections, instancedDetections } = useMemo(
    () => partitionCuboidsByEditedLabel(detectionsToRender, editedLabelId),
    [detectionsToRender, editedLabelId],
  );

  // Detections render model -> JSX (standalone / actively-edited path)
  const cuboidOverlays = useMemo(
    () =>
      standaloneDetections.map((overlay) => {
        const worldTransform =
          directPcdWorldTransformsBySampleId[overlay.sampleId];
        const cuboid = (
          <DragGate3D
            dragThresholdPx={DRAG_GATE_THRESHOLD_PX}
            onClick={(e) => handleSelect(overlay, ANNOTATION_CUBOID, e)}
          >
            <Cuboid
              lineWidth={cuboidLineWidth}
              rotation={
                (overlay.data.rotation as [number, number, number]) ??
                overlayRotation
              }
              itemRotation={overlay.data.rotation ?? itemRotation}
              location={overlay.data.location}
              dimensions={overlay.data.dimensions}
              selected={overlay.ui.selected}
              opacity={getOverlayOpacity(overlay.data._id)}
              label={overlay}
              useLegacyCoordinates={settings.useLegacyCoordinates}
              color={getOverlayColor(overlay)}
              enableFaceResize
              enableHeadingEdit
              hoverSource={hoverSource}
              showOrientation={showCuboidOrientation}
              parentWorldQuaternion={composeParentWorldQuaternion(
                worldTransform?.quaternion,
                overlayRotation,
              )}
            />
          </DragGate3D>
        );
        const key = `cuboid-${overlay.ui.isNew ? "new-" : ""}${
          overlay.data._id
        }-${overlay.sampleId}`;
        const content = <mesh rotation={overlayRotation}>{cuboid}</mesh>;

        return worldTransform ? (
          <group
            key={key}
            position={worldTransform.translation}
            quaternion={worldTransform.quaternion}
          >
            {content}
          </group>
        ) : (
          <group key={key}>{content}</group>
        );
      }),
    [
      standaloneDetections,
      cuboidLineWidth,
      overlayRotation,
      itemRotation,
      getOverlayOpacity,
      handleSelect,
      hoverSource,
      settings,
      getOverlayColor,
      showCuboidOrientation,
      directPcdWorldTransformsBySampleId,
    ],
  );

  // Batched (non-edited) cuboids. `InstancedMesh`'s instanceColor is RGB
  // only — there's no per-instance alpha — so the whole batch shares one
  // opacity value: full (labelAlpha) unless dimming is active anywhere,
  // matching the "at most two live opacity values, focused label always
  // popped out" reasoning in the plan's §6 (a hover on a *different*,
  // non-edited label while dimming is active is the one accepted edge case
  // that can't be represented — that label dims along with the rest).
  const instancedOpacity = focusedLabelIds
    ? (effectiveUnfocusedLabelOpacity ?? labelAlpha)
    : labelAlpha;

  const cuboidInstances = useMemo(() => {
    const batches = new Map<
      string | typeof NATIVE_CUBOID_BATCH,
      ReconciledDetection3D[]
    >();

    for (const detection of instancedDetections) {
      const batchKey = directPcdWorldTransformsBySampleId[detection.sampleId]
        ? detection.sampleId
        : NATIVE_CUBOID_BATCH;
      const batch = batches.get(batchKey) ?? [];
      batch.push(detection);
      batches.set(batchKey, batch);
    }

    return [...batches.entries()].map(([batchKey, detections]) => {
      const isNativeBatch = batchKey === NATIVE_CUBOID_BATCH;
      const sampleId = isNativeBatch ? null : batchKey;
      const worldTransform = sampleId
        ? directPcdWorldTransformsBySampleId[sampleId]
        : undefined;
      const instances = (
        <mesh rotation={overlayRotation}>
          <CuboidInstances
            detections={detections}
            getColor={getOverlayColor}
            opacity={instancedOpacity}
            lineWidth={cuboidLineWidth}
            useLegacyCoordinates={settings.useLegacyCoordinates}
            overlayRotationFallback={overlayRotation}
            hoverSource={hoverSource}
            showOrientation={showCuboidOrientation}
            onClick={(label, e) => handleSelect(label, ANNOTATION_CUBOID, e)}
          />
        </mesh>
      );

      return worldTransform ? (
        <group
          key={sampleId}
          position={worldTransform.translation}
          quaternion={worldTransform.quaternion}
        >
          {instances}
        </group>
      ) : (
        <group key="native">{instances}</group>
      );
    });
  }, [
    cuboidLineWidth,
    directPcdWorldTransformsBySampleId,
    getOverlayColor,
    handleSelect,
    hoverSource,
    instancedDetections,
    instancedOpacity,
    overlayRotation,
    settings.useLegacyCoordinates,
    showCuboidOrientation,
  ]);

  // Polylines render model -> JSX
  const polylineOverlays = useMemo(() => {
    return polylinesToRender.map((overlay) => {
      return (
        <DragGate3D
          key={`polyline-draggate-${overlay.ui.isNew ? "new-" : ""}${
            overlay.data._id
          }-${overlay.sampleId}`}
          dragThresholdPx={DRAG_GATE_THRESHOLD_PX}
          onClick={(e) => handleSelect(overlay, ANNOTATION_POLYLINE, e)}
        >
          <Polyline
            rotation={overlayRotation}
            lineWidth={polylineWidth}
            points3d={overlay.data.points3d}
            filled={!!overlay.data.filled}
            closed={!!overlay.data.closed}
            selected={overlay.ui.selected}
            opacity={getOverlayOpacity(overlay.data._id)}
            label={overlay}
            color={getOverlayColor(overlay)}
            hoverSource={hoverSource}
          />
        </DragGate3D>
      );
    });
  }, [
    polylinesToRender,
    overlayRotation,
    getOverlayOpacity,
    polylineWidth,
    handleSelect,
    hoverSource,
    getOverlayColor,
  ]);

  const getOnShiftClickLabelCallback = useOnShiftClickLabel();

  // This effect listens for label toggle events to support shift-click selection
  // of "similar" labels. Similar labels share similar instance IDs.
  useEffect(() => {
    const unsub = selectiveRenderingEventBus.on(
      FO_LABEL_TOGGLED_EVENT,
      (e: LabelToggledEvent) => {
        getOnShiftClickLabelCallback(e);
      },
    );

    return () => {
      unsub();
    };
  }, [getOnShiftClickLabelCallback]);

  return (
    <group>
      {workingStoreManager}
      {cuboidOverlays}
      {cuboidInstances}
      {polylineOverlays}
    </group>
  );
};
