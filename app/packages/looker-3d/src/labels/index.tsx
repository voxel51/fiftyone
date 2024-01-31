import {
  getLabelColor,
  shouldShowLabelTag,
} from "@fiftyone/looker/src/overlays/util";
import * as fop from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { get as _get } from "lodash";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import {
  Looker3dPluginSettings,
  defaultPluginSettings,
} from "../Looker3dPlugin";
import { usePathFilter } from "../hooks";
import { toEulerFromDegreesArray } from "../utils";
import { Cuboid, CuboidProps } from "./cuboid";
import { OverlayLabel, load3dOverlays } from "./loader";
import { PolyLineProps, Polyline } from "./polyline";

export interface ThreeDLabelsProps {
  sampleMap: Record<string, any>;
}

export const ThreeDLabels = ({ sampleMap }: ThreeDLabelsProps) => {
  const { coloring, selectedLabelTags, customizeColorSetting, labelTagColors } =
    useRecoilValue(fos.lookerOptions({ withFilter: true, modal: true }));

  const settings = fop.usePluginSettings<Looker3dPluginSettings>(
    "3d",
    defaultPluginSettings
  );
  const onSelectLabel = fos.useOnSelectLabel();
  const getFieldColor = useRecoilValue(fos.colorMap);
  const pathFilter = usePathFilter();
  const colorScheme = useRecoilValue(fos.colorScheme);
  const selectedLabels = useRecoilValue(fos.selectedLabelMap);
  const tooltip = fos.useTooltip();
  const colorSchemeFields = colorScheme?.fields;
  const labelAlpha = colorScheme.opacity;

  const handleSelect = useCallback(
    (label: OverlayLabel) => {
      onSelectLabel({
        detail: {
          id: label._id,
          field: label.path[label.path.length - 1],
          sampleId: label.sampleId,
        },
      });
    },
    [onSelectLabel]
  );

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
      load3dOverlays(sampleMap, selectedLabels)
        .map((l) => {
          const path = l.path.join(".");
          const isTagged = shouldShowLabelTag(selectedLabelTags, l.tags);
          const color = getLabelColor({
            coloring,
            path,
            label: l,
            isTagged,
            labelTagColors,
            customizeColorSetting,
          });

          return { ...l, color, id: l._id };
        })
        .filter((l) => pathFilter(l.path.join("."), l)),
    [
      coloring,
      getFieldColor,
      pathFilter,
      sampleMap,
      selectedLabels,
      colorSchemeFields,
      colorScheme,
    ]
  );
  const [cuboidOverlays, polylineOverlays] = useMemo(() => {
    const newCuboidOverlays = [];
    const newPolylineOverlays = [];

    for (const overlay of rawOverlays) {
      if (overlay._cls === "Detection") {
        newCuboidOverlays.push(
          <Cuboid
            key={`cuboid-${overlay.id ?? overlay._id}-${overlay.sampleId}`}
            rotation={overlayRotation}
            itemRotation={itemRotation}
            opacity={labelAlpha}
            {...(overlay as unknown as CuboidProps)}
            onClick={() => handleSelect(overlay)}
            label={overlay}
            tooltip={tooltip}
            useLegacyCoordinates={settings.useLegacyCoordinates}
          />
        );
      } else if (
        overlay._cls === "Polyline" &&
        (overlay as unknown as PolyLineProps).points3d
      ) {
        newPolylineOverlays.push(
          <Polyline
            key={`polyline-${overlay._id ?? overlay.id}-${overlay.sampleId}`}
            rotation={overlayRotation}
            opacity={labelAlpha}
            {...(overlay as unknown as PolyLineProps)}
            label={overlay}
            onClick={() => handleSelect(overlay)}
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
  ]);

  return (
    <group>
      <mesh rotation={overlayRotation}>{cuboidOverlays}</mesh>
      {polylineOverlays}
    </group>
  );
};
