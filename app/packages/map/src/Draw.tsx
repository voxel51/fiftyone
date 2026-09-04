import React from "react";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { IControl } from "maplibre-gl";
import { useControl as useMapboxControl } from "react-map-gl/mapbox-legacy";
import { useControl as useMaplibreControl } from "react-map-gl/maplibre";

export type DrawCreateEvent = {
  features: [GeoJSON.Feature<GeoJSON.Polygon>];
};

type DrawEventMap = {
  on: (type: "draw.create", listener: (event: DrawCreateEvent) => void) => void;
  off: (
    type: "draw.create",
    listener: (event: DrawCreateEvent) => void,
  ) => void;
};

interface DrawControlProps {
  draw: MapboxDraw;
  onCreate?: (event: DrawCreateEvent) => void;
}

const useCreateHandler = ({ draw, onCreate }: DrawControlProps) => {
  const create = React.useRef(onCreate);
  create.current = onCreate;

  return React.useCallback(
    (event: DrawCreateEvent) => {
      create.current?.(event);
      const featureId = event.features[0].id;
      if (featureId !== undefined) {
        draw.delete(String(featureId));
      }
    },
    [draw],
  );
};

export function MapLibreDrawControl(props: DrawControlProps) {
  const handleCreate = useCreateHandler(props);

  useMaplibreControl<IControl>(
    ({ map }) => {
      (map as unknown as DrawEventMap).on("draw.create", handleCreate);

      // MapboxDraw supports MapLibre at runtime, but its types use Mapbox GL.
      return props.draw as unknown as IControl;
    },
    ({ map }) => {
      (map as unknown as DrawEventMap).off("draw.create", handleCreate);
    },
  );

  return null;
}

export function MapboxDrawControl(props: DrawControlProps) {
  const handleCreate = useCreateHandler(props);

  useMapboxControl<MapboxDraw>(
    ({ map }) => {
      (map as unknown as DrawEventMap).on("draw.create", handleCreate);
      return props.draw;
    },
    ({ map }) => {
      (map as unknown as DrawEventMap).off("draw.create", handleCreate);
    },
  );

  return null;
}
