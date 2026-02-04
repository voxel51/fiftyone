import { useAnnotationEventBus } from "@fiftyone/annotation";
import {
  activeLabelSchemas,
  labelSchemaData,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/state";
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
import { getDefaultStore, useAtomValue } from "jotai";
import { folder, useControls } from "leva";
import { get as _get } from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import {
  useInitializeWorking,
  useIsWorkingInitialized,
  useRenderModel,
  useResetWorkingOnModeChange,
  useTransientCleanup,
} from "../annotation/store";
import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "../annotation/types";
import { useSetEditingToExisting3dLabel } from "../annotation/useSetEditingToExisting3dLabel";
import { useSyncWorkingToSidebar } from "../annotation/useSyncWorkingToSidebar";
import {
  ANNOTATION_CUBOID,
  ANNOTATION_POLYLINE,
  DRAG_GATE_THRESHOLD_PX,
  PANEL_ORDER_LABELS,
} from "../constants";
import { usePathFilter } from "../hooks";
import { type Looker3dSettings, defaultPluginSettings } from "../settings";
import {
  cuboidLabelLineWidthAtom,
  current3dAnnotationModeAtom,
  currentArchetypeSelectedForTransformAtom,
  editSegmentsModeAtom,
  isActivelySegmentingSelector,
  polylineLabelLineWidthAtom,
  selectedLabelForAnnotationAtom,
  transformModeAtom,
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

export interface ThreeDLabelsProps {
  sampleMap: { [sliceOrFilename: string]: fos.ModalSample } | fos.Sample[];
  globalOpacity?: number;
}

export const ThreeDLabels = ({
  sampleMap,
  globalOpacity,
}: ThreeDLabelsProps) => {
  const mode = fos.useModalMode();
  const schema = useRecoilValue(fieldSchema({ space: fos.State.SPACE.SAMPLE }));
  const annotationSchemas = useAtomValue(activeLabelSchemas);
  const { coloring, selectedLabelTags, customizeColorSetting, labelTagColors } =
    useRecoilValue(fos.lookerOptions({ withFilter: true, modal: true }));
  const isSegmenting = useRecoilValue(isActivelySegmentingSelector);
  const setCurrent3dAnnotationMode = useSetRecoilState(
    current3dAnnotationModeAtom
  );

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
  const selectedLabels = useRecoilValue(fos.selectedLabelMap);
  const tooltip = fos.useTooltip();
  const labelAlpha = globalOpacity ?? colorScheme.opacity;

  const [selectedLabelForAnnotation, setSelectedLabelForAnnotation] =
    useRecoilState(selectedLabelForAnnotationAtom);
  const setEditSegmentsMode = useSetRecoilState(editSegmentsModeAtom);

  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const setCurrentArchetypeSelectedForTransform = useSetRecoilState(
    currentArchetypeSelectedForTransformAtom
  );

  const setEditingToExistingPolyline =
    useSetEditingToExisting3dLabel(ANNOTATION_POLYLINE);
  const setEditingToExistingCuboid =
    useSetEditingToExisting3dLabel(ANNOTATION_CUBOID);

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

  const selectLabelForAnnotation = useCallback(
    (label: OverlayLabel, archetype: Archetype3d) => {
      setSelectedLabelForAnnotation(label);

      // We only support translate for polylines for now
      if (
        isPolyline3dOverlay(label) &&
        (transformMode === "rotate" || transformMode === "scale")
      ) {
        setTransformMode("translate");
      }

      if (archetype === ANNOTATION_CUBOID) {
        setCurrent3dAnnotationMode(ANNOTATION_CUBOID);
      } else if (archetype === ANNOTATION_POLYLINE) {
        setCurrent3dAnnotationMode(ANNOTATION_POLYLINE);
      }
    },
    [
      setSelectedLabelForAnnotation,
      transformMode,
      setTransformMode,
      setCurrent3dAnnotationMode,
    ]
  );

  const annotationEventBus = useAnnotationEventBus();

  const handleSelect = useCallback(
    (
      label: OverlayLabel,
      archetype: Archetype3d,
      e: ThreeEvent<MouseEvent>
    ) => {
      if (isSegmenting) return;
      if (mode === fos.ModalMode.ANNOTATE) {
        // Check if field is read-only
        const store = getDefaultStore();
        const fieldSchemaData = store.get(labelSchemaData(label.path));
        const isReadOnly = !!fieldSchemaData?.read_only;

        annotationEventBus.dispatch("annotation:3dLabelSelected", {
          id: label._id ?? label["id"],
          archetype,
          label,
        });

        if (archetype === ANNOTATION_CUBOID) {
          if (!isReadOnly) {
            selectLabelForAnnotation(label, archetype);
            setCurrentArchetypeSelectedForTransform(archetype);
          }

          setEditingToExistingCuboid(label);
          return;
        }

        if (archetype === ANNOTATION_POLYLINE) {
          if (!isReadOnly) {
            selectLabelForAnnotation(label, archetype);
            setCurrentArchetypeSelectedForTransform(archetype);
          }

          setEditingToExistingPolyline(label);
        }

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
    [
      onSelectLabel,
      mode,
      selectLabelForAnnotation,
      isSegmenting,
      setEditingToExistingPolyline,
      setEditingToExistingCuboid,
      setCurrentArchetypeSelectedForTransform,
      annotationEventBus,
    ]
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        mode === "annotate" &&
        selectedLabelForAnnotation
      ) {
        setSelectedLabelForAnnotation(null);
        setEditSegmentsMode(false);

        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handler);

    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [setSelectedLabelForAnnotation, mode, selectedLabelForAnnotation]);

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

  // Initialize working annotation store from baseline raw overlays
  useInitializeWorking(rawOverlays);

  // Reset annotation working store when leaving annotate mode
  useResetWorkingOnModeChange();

  // Sync authoritative working store changes to sidebar atoms
  useSyncWorkingToSidebar();

  // Ensure transient states like drag are properly cleaned up
  useTransientCleanup();

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
    (overlay: ReconciledDetection3D | ReconciledPolyline3D) =>
      overlay.isNew
        ? getLabelColor({
            coloring,
            path: overlay.path,
            isTagged: false,
            labelTagColors,
            customizeColorSetting,
            label: overlay,
            embeddedDocType: overlay._cls,
          })
        : overlay.color,
    [coloring, labelTagColors, customizeColorSetting]
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
          onClick={(e) => handleSelect(overlay, ANNOTATION_CUBOID, e)}
        >
          <Cuboid
            lineWidth={cuboidLineWidth}
            rotation={overlayRotation}
            itemRotation={overlay.rotation ?? itemRotation}
            opacity={labelAlpha}
            {...(overlay as unknown as CuboidProps)}
            label={overlay}
            tooltip={tooltip}
            useLegacyCoordinates={settings.useLegacyCoordinates}
            color={getOverlayColor(overlay)}
          />
        </DragGate3D>
      )),
    [
      detectionsToRender,
      cuboidLineWidth,
      overlayRotation,
      itemRotation,
      labelAlpha,
      handleSelect,
      tooltip,
      settings,
      getOverlayColor,
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
        onClick={(e) => handleSelect(overlay, ANNOTATION_POLYLINE, e)}
      >
        <Polyline
          rotation={overlayRotation}
          opacity={labelAlpha}
          lineWidth={polylineWidth}
          {...(overlay as unknown as PolyLineProps)}
          label={overlay}
          tooltip={tooltip}
          color={getOverlayColor(overlay)}
        />
      </DragGate3D>
    ));
  }, [
    polylinesToRender,
    overlayRotation,
    labelAlpha,
    polylineWidth,
    handleSelect,
    tooltip,
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
      <mesh rotation={overlayRotation}>{cuboidOverlays}</mesh>
      {polylineOverlays}
    </group>
  );
};
