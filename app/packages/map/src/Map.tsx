import { container } from "./Map.module.css";

import * as foc from "@fiftyone/components";
import { State, useSetExtendedSelection } from "@fiftyone/state";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import mapbox, { GeoJSONSource, LngLatBounds } from "mapbox-gl";
import React from "react";
import { debounce } from "lodash";
import Map, { Layer, MapRef, Source } from "react-map-gl";
import useResizeObserver from "use-resize-observer";
import "mapbox-gl/dist/mapbox-gl.css";
import contains from "@turf/boolean-contains";

import useGeoLocations from "./useGeoLocations";
import DrawControl from "./Draw";
import { Loading } from "@fiftyone/components";
import { useRecoilValue } from "recoil";
import {
  activeField,
  defaultSettings,
  hasSelection,
  mapStyle,
  MAP_STYLES,
  Settings,
} from "./state";
import Options from "./Options";
import { usePluginSettings } from "@fiftyone/plugins";

const fitBoundsOptions = { animate: false, padding: 30 };

const computeBounds = (coordinates: [number, number][]) =>
  coordinates.reduce(
    (bounds, latLng) => bounds.extend(latLng),
    new LngLatBounds()
  );

const fitBounds = (map: MapRef, coordinates: [number, number][]) => {
  map.fitBounds(computeBounds(coordinates), fitBoundsOptions);
};

const createSourceData = (
  coordinates: [number, number][],
  samples: string[]
): GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }> => {
  return {
    type: "FeatureCollection",
    features: coordinates.map((point, index) => ({
      type: "Feature",
      properties: { id: samples[index] },
      geometry: { type: "Point", coordinates: point },
    })),
  };
};

const Plot: React.FC<{
  dataset: State.Dataset;
  filters: State.Filters;
  view: State.Stage[];
}> = ({ dataset, filters, view }) => {
  const theme = foc.useTheme();

  let { loading, coordinates, samples } = useGeoLocations({
    dataset,
    filters,
    view,
    path: useRecoilValue(activeField),
  });
  const settings = usePluginSettings<Required<Settings>>(
    "map",
    defaultSettings
  );

  const style = useRecoilValue(mapStyle);
  const [selectionData, setSelectionData] =
    React.useState<GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }>>();

  React.useLayoutEffect(() => {
    setSelectionData(undefined);
  }, [dataset, filters, view]);

  const mapRef = React.useRef<MapRef>();
  const onResize = React.useMemo(
    () =>
      debounce(
        () => {
          mapRef.current && mapRef.current.resize();
        },
        0,
        {
          trailing: true,
        }
      ),
    []
  );
  const { ref } = useResizeObserver<HTMLDivElement>({
    onResize,
  });

  const bounds = React.useMemo(() => computeBounds(coordinates), [coordinates]);

  const selection = useRecoilValue(hasSelection);
  const data = React.useMemo(() => {
    return createSourceData(coordinates, samples);
  }, [coordinates, samples, selection]);

  const [draw] = React.useState(
    () =>
      new MapboxDraw({
        displayControlsDefault: false,
        defaultMode: "draw_polygon",
      })
  );

  const onLoad = React.useCallback(() => {
    const map = mapRef.current.getMap();
    map.on("click", "cluster", (event) => {
      event.preventDefault();
      const features = map.queryRenderedFeatures(event.point, {
        layers: ["cluster"],
      });
      draw.changeMode("simple_select");

      const clusterId = features[0].properties.cluster_id;
      const source = map.getSource("points") as GeoJSONSource;
      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error) return;

        const point = features[0].geometry as GeoJSON.Point;
        mapRef.current.easeTo({
          center: point.coordinates as [number, number],
          zoom: zoom,
        });
      });
    });

    const pointer = () => (map.getCanvas().style.cursor = "pointer");
    const crosshair = () => (map.getCanvas().style.cursor = "crosshair");
    const drag = () => (map.getCanvas().style.cursor = "all-scroll");
    map.on("mouseenter", "cluster", pointer);
    map.on("mouseleave", "cluster", crosshair);
    map.on("mouseenter", "point", () => pointer);
    map.on("mouseleave", "point", () => crosshair);
    map.on("dragstart", drag);
    map.on("dragend", crosshair);
  }, []);

  const setSelection = useSetExtendedSelection();

  React.useEffect(() => {
    mapRef.current && fitBounds(mapRef.current, coordinates);
  }, [coordinates]);

  if (!settings.mapboxAccessToken) {
    return <Loading>No Mapbox token provided</Loading>;
  }

  if (!coordinates.length && !loading) {
    return <Loading>No data</Loading>;
  }

  return (
    <div className={container} ref={ref}>
      {loading && !coordinates.length ? (
        <foc.Loading style={{ opacity: 0.5 }}>Pixelating...</foc.Loading>
      ) : (
        <Map
          ref={mapRef}
          mapLib={mapbox}
          mapStyle={`mapbox://styles/mapbox/${MAP_STYLES[style]}`}
          initialViewState={{
            bounds,
            fitBoundsOptions,
          }}
          onStyleData={() => {
            mapRef.current.getCanvas().style.cursor = "crosshair";
          }}
          mapboxAccessToken={settings.mapboxAccessToken}
          onLoad={onLoad}
          onRender={() => {
            try {
              if (draw.getMode() !== "draw_polygon") {
                draw.changeMode("draw_polygon");
              }
            } catch {}
          }}
        >
          <Source
            id="points"
            type="geojson"
            data={selectionData || data}
            cluster={settings.clustering}
            clusterMaxZoom={12}
          >
            {settings.clustering && (
              <Layer
                id={"cluster"}
                filter={["has", "point_count"]}
                paint={{
                  "circle-color": theme.brand,
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
                }}
                type={"circle"}
              />
            )}
            {settings.clustering && (
              <Layer
                id={"cluster-count"}
                filter={["has", "point_count"]}
                layout={{
                  "text-field": "{point_count_abbreviated}",
                  "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
                  "text-size": 12,
                }}
                paint={settings.clusters.textPaint}
                type={"symbol"}
              />
            )}

            <Layer
              id={"point"}
              filter={["!", ["has", "point_count"]]}
              paint={settings.pointPaint}
              type={"circle"}
            />
          </Source>
          <DrawControl
            draw={draw}
            onCreate={(event) => {
              const {
                features: [polygon],
              } = event;
              const selected = new Set<string>();
              const newCoordinates = [];
              const newSamples = [];
              for (let index = 0; index < coordinates.length; index++) {
                if (
                  contains(
                    polygon as GeoJSON.Feature<GeoJSON.Polygon>,
                    data.features[index]
                  )
                ) {
                  selected.add(data.features[index].properties.id);
                  newCoordinates.push(
                    data.features[index].geometry.coordinates
                  );
                }
              }

              if (!selected.size) {
                return;
              }

              const source = mapRef.current.getSource("points");
              if (source.type === "geojson") {
                setSelectionData(createSourceData(newCoordinates, newSamples));
              }

              setSelection([...selected]);
              fitBounds(mapRef.current, newCoordinates);
            }}
          />
        </Map>
      )}

      <Options
        fitData={() => fitBounds(mapRef.current, coordinates)}
        fitSelectionData={() =>
          fitBounds(
            mapRef.current,
            (selectionData || data).features.map(
              ({ geometry: { coordinates } }) => coordinates as [number, number]
            )
          )
        }
        clearSelectionData={() => setSelectionData(undefined)}
      />
    </div>
  );
};

export default Plot;
