import { container, options } from "./Map.module.css";

import * as foc from "@fiftyone/components";
import { State, useSetView } from "@fiftyone/state";
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

const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1IjoiYmVuamFtaW5wa2FuZSIsImEiOiJjbDV3bG1qbmUwazVkM2JxdjA2Mmwza3JpIn0.WnOukHfx7LBTOiOEYth-uQ";

const MAP_STYLES = {
  Street: "streets-v11",
  Dark: "dark-v10",
  Light: "light-v10",
  Outdoors: "outdoors-v11",
  Satellite: "satellite-v9",
};
const fitBoundsOptions = { animate: false, padding: 30 };

const STYLES = Object.keys(MAP_STYLES);

const computeBounds = (coordinates: [number, number][]) =>
  coordinates.reduce(
    (bounds, latLng) => bounds.extend(latLng),
    new LngLatBounds()
  );

const fitBounds = (map: MapRef, coordinates: [number, number][]) => {
  map.fitBounds(computeBounds(coordinates), fitBoundsOptions);
};

const useSearch = (search: string) => {
  const values = STYLES.filter((style) => style.includes(search));

  return { values };
};

const Value: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

const useGeoFields = (dataset: State.Dataset): string[] => {
  return React.useMemo(() => {
    return dataset.sampleFields
      .filter((f) => f.embeddedDocType === "fiftyone.core.labels.GeoLocation")
      .map(({ name }) => name)
      .sort();
  }, [dataset]);
};

const Plot: React.FC<{
  dataset: State.Dataset;
  filters: State.Filters;
  view: State.Stage[];
}> = ({ dataset, filters, view }) => {
  const theme = foc.useTheme();

  const fields = useGeoFields(dataset);

  const [activeField, setActiveField] = React.useState(() => fields[0]);

  let { loading, coordinates, samples } = useGeoLocations({
    dataset,
    filters,
    view,
    path: activeField,
  });

  const [style, setStyle] = React.useState("Dark");

  const selectorStyle = {
    background: theme.backgroundTransparent,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    padding: "0.25rem",
  };

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

  const data = React.useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }>
  >(() => {
    return {
      type: "FeatureCollection",
      features: coordinates.map((point, index) => ({
        type: "Feature",
        properties: { id: samples[index] },
        geometry: { type: "Point", coordinates: point },
      })),
    };
  }, [coordinates, samples]);
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
    const drag = () => (map.getCanvas().style.cursor = "grabbing");
    map.on("mouseenter", "cluster", pointer);
    map.on("mouseleave", "cluster", crosshair);
    map.on("mouseenter", "point", () => pointer);
    map.on("mouseleave", "point", () => crosshair);
    map.on("dragstart", drag);
    map.on("dragend", crosshair);
  }, []);

  const setView = useSetView();

  React.useEffect(() => {
    mapRef.current && fitBounds(mapRef.current, coordinates);
  }, [coordinates]);

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
          mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
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
            data={data}
            cluster={true}
            clusterMaxZoom={12}
          >
            <Layer
              id={"cluster"}
              filter={["has", "point_count"]}
              paint={{
                // Use step expressions (https://docs.mapbox.com/mapbox-gl-js/style-spec/#expressions-step)
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
              }}
              type={"circle"}
            />
            <Layer
              id={"cluster-count"}
              filter={["has", "point_count"]}
              layout={{
                "text-field": "{point_count_abbreviated}",
                "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
                "text-size": 12,
              }}
              paint={{ "text-color": theme.font }}
              type={"symbol"}
            />
            <Layer
              id={"point"}
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": theme.brand,
                "circle-opacity": 0.7,
                "circle-radius": 4,
              }}
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

              setView((current) => {
                return [
                  ...current,
                  {
                    _cls: "fiftyone.core.stages.Select",
                    kwargs: [
                      ["sample_ids", [...selected]],
                      ["ordered", false],
                    ],
                  },
                ];
              });
              fitBounds(mapRef.current, newCoordinates);
            }}
          />
        </Map>
      )}
      <div className={options}>
        <foc.Selector
          placeholder={"Map Style"}
          value={style}
          onSelect={setStyle}
          useSearch={useSearch}
          component={Value}
          containerStyle={selectorStyle}
          overflow={true}
        />
        {fields.length > 1 && (
          <foc.Selector
            placeholder={"Field"}
            value={activeField}
            onSelect={setActiveField}
            useSearch={() => {
              return { values: fields };
            }}
            component={Value}
            containerStyle={selectorStyle}
            overflow={true}
          />
        )}
      </div>
    </div>
  );
};

export default Plot;
