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
import { DETECTION, POLYLINE } from "@fiftyone/utilities";
import { ThreeEvent } from "@react-three/fiber";
import { getDefaultStore, useAtomValue } from "jotai";
import { folder, useControls } from "leva";
import { get as _get } from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "../annotation/types";
import { useSetEditingToExistingCuboid } from "../annotation/useSetEditingToExistingCuboid";
import { useSetEditingToExistingPolyline } from "../annotation/useSetEditingToExistingPolyline";
import { PANEL_ORDER_LABELS } from "../constants";
import { usePathFilter } from "../hooks";
import { useReconciledLabels3D } from "../hooks/use-reconciled-labels";
import { type Looker3dSettings, defaultPluginSettings } from "../settings";
import {
  cuboidLabelLineWidthAtom,
  current3dAnnotationModeAtom,
  currentArchetypeSelectedForTransformAtom,
  editSegmentsModeAtom,
  isActivelySegmentingSelector,
  polylineLabelLineWidthAtom,
  selectedLabelForAnnotationAtom,
  stagedCuboidTransformsAtom,
  stagedPolylineTransformsAtom,
  transformModeAtom,
} from "../state";
import { Archetype3d } from "../types";
import { toEulerFromDegreesArray } from "../utils";
import { Cuboid, type CuboidProps } from "./cuboid";
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
  const mode = useAtomValue(fos.modalMode);
  const schema = useRecoilValue(fieldSchema({ space: fos.State.SPACE.SAMPLE }));
  const annotationSchemas = useAtomValue(activeLabelSchemas);
  const { coloring, selectedLabelTags, customizeColorSetting, labelTagColors } =
    useRecoilValue(fos.lookerOptions({ withFilter: true, modal: true }));
  const isSegmenting = useRecoilValue(isActivelySegmentingSelector);
  const [current3dAnnotationMode, setCurrent3dAnnotationMode] = useRecoilState(
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

  const setEditingToExistingPolyline = useSetEditingToExistingPolyline();
  const setEditingToExistingCuboid = useSetEditingToExistingCuboid();

  const stagedPolylineTransforms = useRecoilValue(stagedPolylineTransformsAtom);
  const stagedCuboidTransforms = useRecoilValue(stagedCuboidTransformsAtom);

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
        label._cls === "Polyline" &&
        (transformMode === "rotate" || transformMode === "scale")
      ) {
        setTransformMode("translate");
      }

      // Set the appropriate annotation mode active based on archetype
      if (archetype === "cuboid") {
        setCurrent3dAnnotationMode("cuboid");
      } else if (archetype === "polyline") {
        setCurrent3dAnnotationMode("polyline");
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
      if (mode === "annotate") {
        // Check if field is read-only
        const store = getDefaultStore();
        const fieldSchema = store.get(labelSchemaData(label.path));
        const isReadOnly = !!fieldSchema?.read_only;

        annotationEventBus.dispatch("annotation:3dLabelSelected", {
          id: label._id ?? label["id"],
          archetype,
          label,
        });

        if (archetype === "cuboid") {
          if (!isReadOnly) {
            selectLabelForAnnotation(label, archetype);
            setCurrentArchetypeSelectedForTransform(archetype);
          }

          setEditingToExistingCuboid(label);
          return;
        }

        if (archetype === "polyline") {
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

  const rawOverlays = useMemo(
    () =>
      load3dOverlays(sampleMap, selectedLabels, [], schema)
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
          if (mode === "annotate") {
            const isInAnnotationSchemas = Boolean(
              annotationSchemas?.includes(l.path)
            );

            if (!isInAnnotationSchemas) {
              return false;
            }

            // Further filter based on current annotation mode
            if (current3dAnnotationMode === "cuboid") {
              return l._cls === DETECTION || l.type === DETECTION;
            }
            if (current3dAnnotationMode === "polyline") {
              return l._cls === POLYLINE || l.type === POLYLINE;
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
      current3dAnnotationMode,
    ]
  );

  // Step 1: Compute merged overlays (data computation)
  // This hook also syncs the merged overlays to state for downstream consumers
  const {
    detections: reconciledDetection3Ds,
    polylines: reconciledPolyline3Ds,
  } = useReconciledLabels3D({
    rawOverlays,
    stagedPolylineTransforms,
    stagedCuboidTransforms,
  });

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

  // Step 2: Create JSX elements from merged data (rendering only)
  const cuboidOverlays = useMemo(
    () =>
      reconciledDetection3Ds.map((overlay) => (
        <Cuboid
          key={`cuboid-${overlay.isNew ? "new-" : ""}${overlay._id}-${
            overlay.sampleId
          }`}
          lineWidth={cuboidLineWidth}
          rotation={overlayRotation}
          itemRotation={overlay.rotation ?? itemRotation}
          opacity={labelAlpha}
          {...(overlay as unknown as CuboidProps)}
          onClick={(e) => handleSelect(overlay, "cuboid", e)}
          label={overlay}
          tooltip={tooltip}
          useLegacyCoordinates={settings.useLegacyCoordinates}
          color={getOverlayColor(overlay)}
        />
      )),
    [
      reconciledDetection3Ds,
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

  const polylineOverlays = useMemo(() => {
    return reconciledPolyline3Ds.map((overlay) => (
      <Polyline
        key={`polyline-${overlay.isNew ? "new-" : ""}${overlay._id}-${
          overlay.sampleId
        }`}
        rotation={overlayRotation}
        opacity={labelAlpha}
        lineWidth={polylineWidth}
        {...(overlay as unknown as PolyLineProps)}
        label={overlay}
        onClick={(e) => handleSelect(overlay, "polyline", e)}
        tooltip={tooltip}
        color={getOverlayColor(overlay)}
      />
    ));
  }, [
    reconciledPolyline3Ds,
    overlayRotation,
    labelAlpha,
    polylineWidth,
    handleSelect,
    tooltip,
    coloring,
    labelTagColors,
    customizeColorSetting,
    getOverlayColor,
  ]);

  const getOnShiftClickLabelCallback = useOnShiftClickLabel();

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
