import { useMemo } from "react";
import { Vector3Tuple } from "three";
import { Cuboid, CuboidProps, PolyLineProps, Polyline } from "../overlays";

export interface ThreeDLabelsProps {
  rawOverlays: any;
  itemRotation: any;
  labelAlpha: number;
  overlayRotation: Vector3Tuple;
  handleSelect: (label: any) => void;
  tooltip: any;
  useLegacyCoordinates: boolean;
}

export const ThreeDLabels = ({
  rawOverlays,
  itemRotation,
  labelAlpha,
  overlayRotation,
  handleSelect,
  tooltip,
  useLegacyCoordinates,
}: ThreeDLabelsProps) => {
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
            useLegacyCoordinates={useLegacyCoordinates}
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
    useLegacyCoordinates,
  ]);

  return (
    <group>
      <mesh rotation={overlayRotation}>{cuboidOverlays}</mesh>
      {polylineOverlays}
    </group>
  );
};
