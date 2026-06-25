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
import { useRecoilState, useRecoilValue } from "recoil";
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
  UNFOCUSED_LABEL_OPACITY,
} from "../constants";
import { usePathFilter, useSelect3DLabelForAnnotation } from "../hooks";
import { type Looker3dSettings, defaultPluginSettings } from "../settings";
import {
  cuboidLabelLineWidthAtom,
  isActivelySegmentingSelector,
  isCreatingCuboidAtom,
  polylineLabelLineWidthAtom,
  hoveredLabelAtom,
  selectedLabelForAnnotationAtom,
  showCuboidOrientationAtom,
} from "../state";
import {
  Archetype3d,
  isDetection3dOverlay,
  isPolyline3dOverlay,
} from "../types";
import { toEulerFromDegreesArray } from "../utils";
import { Cuboid, type CuboidProps } from "./cuboid";
import { DragGate3D } from "./DragGate3D";
import { type OverlayLabel, load3dOverlays } from "./loader";
import { type PolyLineProps, Polyline } from "./polyline";
import { WorkingStoreManager } from "./WorkingStoreManager";

export interface ThreeDLabelsProps {
  sampleMap: Parameters<typeof load3dOverlays>[0];
  globalOpacity?: number;
  isMainPanel?: boolean;
  dimAllLabels?: boolean;
  unfocusedLabelOpacity?: number;
}

export const ThreeDLabels = ({
  sampleMap,
  globalOpacity,
  isMainPanel = true,
  dimAllLabels = false,
  unfocusedLabelOpacity,
}: ThreeDLabelsProps) => {
  const mode = fos.useModalMode();
  const schema = useRecoilValue(fieldSchema({ space: fos.State.SPACE.SAMPLE }));
  const annotationSchemas = useAtomValue(activeLabelSchemas);
  const { coloring, selectedLabelTags, customizeColorSetting, labelTagColors } =
    useRecoilValue(fos.lookerOptions({ withFilter: true, modal: true }));
  const isSegmenting = useRecoilValue(isActivelySegmentingSelector);

  const settings = fop.usePluginSettings<Looker3dSettings>(
    "3d",
    defaultPluginSettings
  );
  const onSelectLabel = fos.useOnSelectLabel();
  const pathFilter = usePathFilter();
  const colorScheme = useRecoilValue(fos.colorScheme);
  const [cuboidLineWidth, setCuboidLineWidth] = useRecoilState(
    cuboidLabelLineWidthAtom
  );
  const [polylineWidth, setPolylineWidth] = useRecoilState(
    polylineLabelLineWidthAtom
  );
  const showCuboidOrientation = useRecoilValue(showCuboidOrientationAtom);
  const isCreatingCuboid = useRecoilValue(isCreatingCuboidAtom);
  const selectedLabels = useRecoilValue(fos.selectedLabelMap);
  const labelAlpha = globalOpacity ?? colorScheme.opacity;

  const selectedLabelForAnnotation = useRecoilValue(
    selectedLabelForAnnotationAtom
  );
  const hoveredLabel = useRecoilValue(hoveredLabelAtom);
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
    [setCuboidLineWidth, setPolylineWidth]
  );

  const handleSelect = useCallback(
    (
      label: OverlayLabel,
      archetype: Archetype3d,
      e: ThreeEvent<MouseEvent>
    ) => {
      if (isSegmenting) return;
      if (mode === fos.ModalMode.ANNOTATE) {
        select3DLabelForAnnotation(label, archetype);
        return;
      }

      onSelectLabel({
        detail: {
          id: label._id,
          field: label.path,
          sampleId: label.sampleId,
          instanceId: label.instance?._id,
          isShiftPressed: e.shiftKey,
        },
      });
    },
    [onSelectLabel, mode, select3DLabelForAnnotation, isSegmenting]
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        mode === "annotate" &&
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
        _get(settings, "overlay.itemRotation", [0, 0, 0])
      ),
    ],
    [settings]
  );

  // Load raw overlays from sample data (for both explore and annotate modes)
  const rawOverlays = useMemo(
    () =>
      (load3dOverlays(sampleMap, selectedLabels, [], schema) ?? [])
        .map((l) => {
          const path = l.path;
          const isTagged = shouldShowLabelTag(selectedLabelTags, l.tags);
          const color = getLabelColor({
            coloring,
            path,
            isTagged,
            labelTagColors,
            customizeColorSetting,
            label: l,
            embeddedDocType: l._cls,
          });

          return { ...l, color, id: l._id };
        })
        .filter((l) => {
          if (!pathFilter(l.path, l)) {
            return false;
          }

          // In annotate mode, only show fields that exist in annotation schemas
          if (mode === fos.ModalMode.ANNOTATE) {
            const isInAnnotationSchemas = Boolean(
              annotationSchemas?.includes(l.path)
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
    ]
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
      if (overlay.isNew) {
        return getLabelColor({
          coloring,
          path: overlay.path,
          isTagged: false,
          labelTagColors,
          customizeColorSetting,
          label: overlay,
          embeddedDocType: overlay._cls,
        });
      }

      return typeof overlay.color === "string" ? overlay.color : "#ffffff";
    },
    [coloring, labelTagColors, customizeColorSetting]
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
    [effectiveUnfocusedLabelOpacity, focusedLabelIds, labelAlpha]
  );

  // Detections render model -> JSX
  const cuboidOverlays = useMemo(
    () =>
      detectionsToRender.map((overlay) => (
        <DragGate3D
          key={`cuboid-${overlay.isNew ? "new-" : ""}${overlay._id}-${
            overlay.sampleId
          }`}
          dragThresholdPx={DRAG_GATE_THRESHOLD_PX}
          onClick={(e) =>
            handleSelect(
              overlay as unknown as OverlayLabel,
              ANNOTATION_CUBOID,
              e
            )
          }
        >
          <Cuboid
            lineWidth={cuboidLineWidth}
            rotation={overlayRotation}
            itemRotation={overlay.rotation ?? itemRotation}
            {...(overlay as unknown as CuboidProps)}
            opacity={getOverlayOpacity(overlay._id)}
            label={overlay as unknown as OverlayLabel}
            useLegacyCoordinates={settings.useLegacyCoordinates}
            color={getOverlayColor(overlay)}
            enableFaceResize={isMainPanel}
            showOrientation={showCuboidOrientation}
          />
        </DragGate3D>
      )),
    [
      detectionsToRender,
      cuboidLineWidth,
      overlayRotation,
      itemRotation,
      getOverlayOpacity,
      handleSelect,
      settings,
      getOverlayColor,
      isMainPanel,
      showCuboidOrientation,
    ]
  );

  // Polylines render model -> JSX
  const polylineOverlays = useMemo(() => {
    return polylinesToRender.map((overlay) => (
      <DragGate3D
        key={`polyline-draggate-${overlay.isNew ? "new-" : ""}${overlay._id}-${
          overlay.sampleId
        }`}
        dragThresholdPx={DRAG_GATE_THRESHOLD_PX}
        onClick={(e) =>
          handleSelect(
            overlay as unknown as OverlayLabel,
            ANNOTATION_POLYLINE,
            e
          )
        }
      >
        <Polyline
          rotation={overlayRotation}
          lineWidth={polylineWidth}
          {...(overlay as unknown as PolyLineProps)}
          opacity={getOverlayOpacity(overlay._id)}
          label={overlay as unknown as OverlayLabel}
          color={getOverlayColor(overlay)}
        />
      </DragGate3D>
    ));
  }, [
    polylinesToRender,
    overlayRotation,
    getOverlayOpacity,
    polylineWidth,
    handleSelect,
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
      }
    );

    return () => {
      unsub();
    };
  }, [getOnShiftClickLabelCallback]);

  return (
    <group>
      {workingStoreManager}
      <mesh rotation={overlayRotation}>{cuboidOverlays}</mesh>
      {polylineOverlays}
    </group>
  );
};
