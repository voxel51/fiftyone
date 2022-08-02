import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { useControl } from "react-map-gl";

import type { MapRef, ControlPosition } from "react-map-gl";

type DrawControlProps = {
  position?: ControlPosition;

  onCreate?: (evt: { features: object[] }) => void;
  onUpdate?: (evt: { features: object[]; action: string }) => void;
  onDelete?: (evt: { features: object[] }) => void;
} & ConstructorParameters<typeof MapboxDraw>[0];

export default function DrawControl({
  position,
  onCreate,

  ...props
}: DrawControlProps) {
  useControl<MapboxDraw>(
    ({ map }: { map: MapRef }) => {
      const draw = new MapboxDraw(props);
      map.on("draw.create", (event) => {
        onCreate(event);

        draw.delete(event.features[0].id);
      });

      map.on("render", () => {
        if (draw.getMode() !== "draw_polygon") {
          draw.changeMode("draw_polygon");
        }
      });

      return draw;
    },
    ({ map }: { map: MapRef }) => {
      map.off("draw.create", onCreate);
    }
  );

  return null;
}
