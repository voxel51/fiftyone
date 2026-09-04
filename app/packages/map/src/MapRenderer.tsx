import MapboxDraw from "@mapbox/mapbox-gl-draw";
import mapbox, {
  type CirclePaint as MapboxCirclePaint,
  type GeoJSONSource as MapboxGeoJSONSource,
  type SymbolPaint as MapboxSymbolPaint,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  type GeoJSONSource as MapLibreGeoJSONSource,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import React from "react";
import MapboxMap, {
  Layer as MapboxLayer,
  type MapRef as MapboxMapRef,
  Source as MapboxSource,
} from "react-map-gl/mapbox-legacy";
import MapLibreMap, {
  Layer as MapLibreLayer,
  type MapRef as MapLibreMapRef,
  Source as MapLibreSource,
} from "react-map-gl/maplibre";

import { MapboxDrawControl, MapLibreDrawControl } from "./Draw";
import {
  getMapStyleUrl,
  OPENFREEMAP_ATTRIBUTION,
  type MapProvider,
} from "./basemaps";
import type { MapSettings } from "./state";

setWorkerUrl(maplibreWorkerUrl);

const fitBoundsOptions = { animate: false, padding: 30 };

export type MapBounds = [[number, number], [number, number]];

export interface MapHandle {
  beforeScreenshot: () => Promise<HTMLCanvasElement>;
  fitBounds: () => void;
  resize: () => void;
}

interface MapRendererProps {
  bounds: MapBounds;
  clusterColor: string;
  data: GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }>;
  draw: MapboxDraw;
  mapboxAccessToken?: string;
  onCreate: (event: { features: [GeoJSON.Feature<GeoJSON.Polygon>] }) => void;
  onError: (error: Error) => void;
  provider: MapProvider;
  settings: MapSettings;
  style: string;
}

type CommonMapRef = {
  fitBounds: (bounds: MapBounds, options: typeof fitBoundsOptions) => unknown;
  getBearing: () => number;
  getCanvas: () => HTMLCanvasElement;
  once: (type: "render", listener: () => void) => unknown;
  resize: () => unknown;
  setBearing: (bearing: number) => unknown;
};

const useMapHandle = <T extends CommonMapRef>(
  ref: React.ForwardedRef<MapHandle>,
  mapRef: React.RefObject<T>,
  bounds: MapBounds,
) => {
  React.useImperativeHandle(
    ref,
    () => ({
      beforeScreenshot: () =>
        new Promise((resolve) => {
          mapRef.current.once("render", () => {
            resolve(mapRef.current.getCanvas());
          });
          mapRef.current.setBearing(mapRef.current.getBearing());
        }),
      fitBounds: () => {
        mapRef.current?.fitBounds(bounds, fitBoundsOptions);
      },
      resize: () => {
        mapRef.current?.resize();
      },
    }),
    [bounds, mapRef],
  );
};

const MapLibreLayers = ({
  clusterColor,
  data,
  settings,
}: Pick<MapRendererProps, "clusterColor" | "data" | "settings">) => (
  <MapLibreSource
    id="points"
    type="geojson"
    data={data}
    cluster={settings.clustering}
    clusterMaxZoom={settings.clusterMaxZoom}
  >
    {settings.clustering && (
      <MapLibreLayer
        id="cluster"
        filter={["has", "point_count"]}
        paint={{
          "circle-color": clusterColor,
          "circle-opacity": 0.7,
          "circle-radius": ["step", ["get", "point_count"], 20, 10, 30, 25, 40],
          ...settings.clusters.paint,
        }}
        type="circle"
      />
    )}
    {settings.clustering && (
      <MapLibreLayer
        id="cluster-count"
        filter={["has", "point_count"]}
        layout={{
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
        }}
        paint={settings.clusters.textPaint}
        type="symbol"
      />
    )}
    <MapLibreLayer
      id="point"
      filter={["!", ["has", "point_count"]]}
      paint={settings.pointPaint}
      type="circle"
    />
  </MapLibreSource>
);

const MapboxLayers = ({
  clusterColor,
  data,
  settings,
}: Pick<MapRendererProps, "clusterColor" | "data" | "settings">) => (
  <MapboxSource
    id="points"
    type="geojson"
    data={data}
    cluster={settings.clustering}
    clusterMaxZoom={settings.clusterMaxZoom}
  >
    {settings.clustering && (
      <MapboxLayer
        id="cluster"
        filter={["has", "point_count"]}
        paint={
          {
            "circle-color": clusterColor,
            "circle-opacity": 0.7,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              20,
              10,
              30,
              25,
              40,
            ],
            ...settings.clusters.paint,
          } as MapboxCirclePaint
        }
        type="circle"
      />
    )}
    {settings.clustering && (
      <MapboxLayer
        id="cluster-count"
        filter={["has", "point_count"]}
        layout={{
          "text-field": "{point_count_abbreviated}",
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 12,
        }}
        paint={settings.clusters.textPaint as MapboxSymbolPaint}
        type="symbol"
      />
    )}
    <MapboxLayer
      id="point"
      filter={["!", ["has", "point_count"]]}
      paint={settings.pointPaint as MapboxCirclePaint}
      type="circle"
    />
  </MapboxSource>
);

const MapLibreRenderer = React.forwardRef<MapHandle, MapRendererProps>(
  (props, ref) => {
    const mapRef = React.useRef<MapLibreMapRef>(null);
    useMapHandle(ref, mapRef, props.bounds);

    const onLoad = React.useCallback(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      map.on("click", "cluster", (event) => {
        event.preventDefault();
        const features = map.queryRenderedFeatures(event.point, {
          layers: ["cluster"],
        });
        props.draw.changeMode("simple_select");

        const clusterId = features[0].properties?.cluster_id;
        const source = map.getSource("points") as MapLibreGeoJSONSource;
        void source
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            const point = features[0].geometry as GeoJSON.Point;
            mapRef.current?.easeTo({
              center: point.coordinates as [number, number],
              zoom,
            });
          })
          .catch(() => undefined);
      });

      const pointer = () => (map.getCanvas().style.cursor = "pointer");
      const crosshair = () => (map.getCanvas().style.cursor = "crosshair");
      const drag = () => (map.getCanvas().style.cursor = "all-scroll");
      map.on("mouseenter", "cluster", pointer);
      map.on("mouseleave", "cluster", crosshair);
      map.on("mouseenter", "point", pointer);
      map.on("mouseleave", "point", crosshair);
      map.on("dragstart", drag);
      map.on("dragend", crosshair);
    }, [props.draw]);

    return (
      <MapLibreMap
        ref={mapRef}
        attributionControl={{ customAttribution: OPENFREEMAP_ATTRIBUTION }}
        mapStyle={getMapStyleUrl("maplibre", props.style)}
        initialViewState={{
          bounds: props.bounds,
          fitBoundsOptions,
        }}
        onStyleData={() => {
          if (mapRef.current) {
            mapRef.current.getCanvas().style.cursor = "crosshair";
          }
        }}
        onLoad={onLoad}
        onRender={() => {
          if (props.draw.getMode() !== "draw_polygon") {
            props.draw.changeMode("draw_polygon");
          }
        }}
        onError={({ error }) => props.onError(error)}
      >
        <MapLibreLayers {...props} />
        <MapLibreDrawControl draw={props.draw} onCreate={props.onCreate} />
      </MapLibreMap>
    );
  },
);

const MapboxRenderer = React.forwardRef<MapHandle, MapRendererProps>(
  (props, ref) => {
    const mapRef = React.useRef<MapboxMapRef>(null);
    useMapHandle(ref, mapRef, props.bounds);

    const onLoad = React.useCallback(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      map.on("click", "cluster", (event) => {
        event.preventDefault();
        const features = map.queryRenderedFeatures(event.point, {
          layers: ["cluster"],
        });
        props.draw.changeMode("simple_select");

        const clusterId = features[0].properties?.cluster_id;
        const source = map.getSource("points") as MapboxGeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return;

          const point = features[0].geometry as GeoJSON.Point;
          mapRef.current?.easeTo({
            center: point.coordinates as [number, number],
            zoom,
          });
        });
      });

      const pointer = () => (map.getCanvas().style.cursor = "pointer");
      const crosshair = () => (map.getCanvas().style.cursor = "crosshair");
      const drag = () => (map.getCanvas().style.cursor = "all-scroll");
      map.on("mouseenter", "cluster", pointer);
      map.on("mouseleave", "cluster", crosshair);
      map.on("mouseenter", "point", pointer);
      map.on("mouseleave", "point", crosshair);
      map.on("dragstart", drag);
      map.on("dragend", crosshair);
    }, [props.draw]);

    return (
      <MapboxMap
        ref={mapRef}
        mapLib={mapbox}
        mapStyle={getMapStyleUrl("mapbox", props.style)}
        initialViewState={{
          bounds: props.bounds,
          fitBoundsOptions,
        }}
        mapboxAccessToken={props.mapboxAccessToken}
        onStyleData={() => {
          if (mapRef.current) {
            mapRef.current.getCanvas().style.cursor = "crosshair";
          }
        }}
        onLoad={onLoad}
        onRender={() => {
          if (props.draw.getMode() !== "draw_polygon") {
            props.draw.changeMode("draw_polygon");
          }
        }}
        onError={({ error }) => props.onError(error)}
      >
        <MapboxLayers {...props} />
        <MapboxDrawControl draw={props.draw} onCreate={props.onCreate} />
      </MapboxMap>
    );
  },
);

const MapRenderer = React.forwardRef<MapHandle, MapRendererProps>(
  (props, ref) => {
    if (props.provider === "mapbox") {
      return <MapboxRenderer {...props} ref={ref} />;
    }

    return <MapLibreRenderer {...props} ref={ref} />;
  },
);

export default MapRenderer;
