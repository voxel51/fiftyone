import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { useControl } from "react-map-gl";

import type { MapRef } from "react-map-gl";

interface DrawControlProps {
  draw: MapboxDraw;
  onCreate?: (event: { features: [GeoJSON.Feature<GeoJSON.Polygon>] }) => void;
}

export default function DrawControl({ draw, onCreate }: DrawControlProps) {
  useControl<MapboxDraw>(
    ({ map }: { map: MapRef }) => {
      map.on("draw.create", (event) => {
        onCreate(event);

        draw.delete(event.features[0].id);
      });

      return draw;
    },
    ({ map }: { map: MapRef }) => {
      map.off("draw.create", onCreate);
    }
  );

  return null;
}
