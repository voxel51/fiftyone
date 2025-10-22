import { activeSchemas } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/state";
import {
  FO_LABEL_TOGGLED_EVENT,
  LabelToggledEvent,
  Sample,
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
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { PANEL_ORDER_LABELS } from "../constants";
import { usePathFilter } from "../hooks";
import { type Looker3dSettings, defaultPluginSettings } from "../settings";
import {
  cuboidLabelLineWidthAtom,
  currentArchetypeSelectedForTransformAtom,
  editSegmentsModeAtom,
  polylineLabelLineWidthAtom,
  polylinePointTransformsAtom,
  segmentStateAtom,
  selectedLabelForAnnotationAtom,
  transformModeAtom,
} from "../state";
import { TransformArchetype } from "../types";
import { toEulerFromDegreesArray } from "../utils";
import { Cuboid, type CuboidProps } from "./cuboid";
import { type OverlayLabel, load3dOverlays } from "./loader";
import { type PolyLineProps, Polyline } from "./polyline";

export interface ThreeDLabelsProps {
  sampleMap: { [sliceOrFilename: string]: Sample } | fos.Sample[];
  globalOpacity?: number;
}

export const ThreeDLabels = ({
  sampleMap,
  globalOpacity,
}: ThreeDLabelsProps) => {
  const mode = useAtomValue(fos.modalMode);
  const schema = useRecoilValue(fieldSchema({ space: fos.State.SPACE.SAMPLE }));
  const annotationSchemas = useAtomValue(activeSchemas);
  const { coloring, selectedLabelTags, customizeColorSetting, labelTagColors } =
    useRecoilValue(fos.lookerOptions({ withFilter: true, modal: true }));
  const isSegmenting = useRecoilValue(segmentStateAtom).isActive;

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
  const polylinePointTransforms = useRecoilValue(polylinePointTransformsAtom);
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

  const currentSampleId = useRecoilValue(fos.currentSampleId);

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
    (label: OverlayLabel) => {
      setSelectedLabelForAnnotation(label);

      // We only support translate for polylines for now
      if (
        label._cls === "Polyline" &&
        (transformMode === "rotate" || transformMode === "scale")
      ) {
        setTransformMode("translate");
      }
    },
    [setSelectedLabelForAnnotation, transformMode, setTransformMode]
  );

  const handleSelect = useCallback(
    (
      label: OverlayLabel,
      archetype: TransformArchetype,
      e: ThreeEvent<MouseEvent>
    ) => {
      if (isSegmenting) return;

      if (mode === "annotate") {
        if (archetype === "cuboid") {
          return;
        }

        selectLabelForAnnotation(label);
        setCurrentArchetypeSelectedForTransform(archetype);

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
    [onSelectLabel, mode, selectLabelForAnnotation, isSegmenting]
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
            return annotationSchemas && l.path in annotationSchemas;
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
  const [cuboidOverlays, polylineOverlays] = useMemo(() => {
    const newCuboidOverlays = [];
    const newPolylineOverlays = [];

    for (const overlay of rawOverlays) {
      if (
        overlay._cls === "Detection" &&
        overlay.dimensions &&
        overlay.location
      ) {
        newCuboidOverlays.push(
          <Cuboid
            key={`cuboid-${overlay.id ?? overlay._id}-${overlay.sampleId}`}
            lineWidth={cuboidLineWidth}
            rotation={overlayRotation}
            itemRotation={itemRotation}
            opacity={labelAlpha}
            {...(overlay as CuboidProps)}
            onClick={(e) => handleSelect(overlay, "cuboid", e)}
            label={overlay}
            tooltip={tooltip}
            useLegacyCoordinates={settings.useLegacyCoordinates}
          />
        );
      } else if (
        overlay._cls === "Polyline" &&
        (overlay as PolyLineProps).points3d
      ) {
        const transformData = polylinePointTransforms[overlay._id];
        const finalPoints3d = transformData?.segments
          ? transformData.segments.map((seg) => seg.points)
          : (overlay as PolyLineProps).points3d;

        newPolylineOverlays.push(
          <Polyline
            key={`polyline-${overlay._id ?? overlay.id}-${overlay.sampleId}`}
            rotation={overlayRotation}
            opacity={labelAlpha}
            lineWidth={polylineWidth}
            {...(overlay as PolyLineProps)}
            points3d={finalPoints3d}
            label={overlay}
            onClick={(e) => handleSelect(overlay, "polyline", e)}
            tooltip={tooltip}
          />
        );
      }
    }

    // Check for any label ids in polylinePointTransformsAtom that are not in newPolylineOverlays
    // and create new polyline overlays for them
    const existingPolylineIds = new Set(
      rawOverlays
        .filter((overlay) => overlay._cls === "Polyline")
        .map((overlay) => overlay._id)
    );

    for (const [labelId, transformData] of Object.entries(
      polylinePointTransforms
    )) {
      if (!transformData.segments || transformData.segments.length === 0)
        continue;

      // Only process transforms for the current sample
      if (transformData.sampleId !== currentSampleId) {
        continue;
      }

      if (existingPolylineIds.has(labelId)) {
        continue;
      }

      const points3d: THREE.Vector3Tuple[][] = transformData.segments.map(
        (segment) => segment.points
      );

      // Only create overlay if we have valid segments
      if (points3d.length > 0) {
        const overlayLabel = {
          _id: labelId,
          _cls: "Polyline",
          type: "Polyline",
          path: transformData.path,
          selected: false,
          sampleId: currentSampleId,
          tags: [],
          points3d,
        };

        newPolylineOverlays.push(
          <Polyline
            key={`polyline-${labelId}`}
            rotation={overlayRotation}
            opacity={labelAlpha}
            lineWidth={polylineWidth}
            points3d={points3d}
            filled={false}
            selected={false}
            {...(overlayLabel as unknown as PolyLineProps)}
            label={overlayLabel}
            onClick={(e) => handleSelect(overlayLabel, "polyline", e)}
            tooltip={tooltip}
          />
        );
      }
    }

    return [newCuboidOverlays, newPolylineOverlays];
  }, [
    rawOverlays,
    itemRotation,
    labelAlpha,
    overlayRotation,
    handleSelect,
    tooltip,
    settings,
    transformMode,
    polylinePointTransforms,
    polylineWidth,
    currentSampleId,
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
