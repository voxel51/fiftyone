import { container, map, options } from "./Map.module.css";

import * as foc from "@fiftyone/components";
import mapboxgl from "mapbox-gl";
import Plotly from "plotly.js-dist";
import React, {
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
} from "react";
import { v4 as uuid } from "uuid";
import useGeoLocations from "./useGeoLocations";
import { Loading, useTheme } from "@fiftyone/components";
import { deferrer, State } from "@fiftyone/state";

const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1IjoiYmVuamFtaW5wa2FuZSIsImEiOiJjbDV3bG1qbmUwazVkM2JxdjA2Mmwza3JpIn0.WnOukHfx7LBTOiOEYth-uQ";

const MAP_STYLES = {
  Street: "streets",
  Light: "light",
  Dark: "dark",
  Satellite: "satellite",
  "Satellite Streets": "satellite-streets",
};

const COLOR = "red";
const SIZE = 10;

const STYLES = Object.keys(MAP_STYLES);

const useSearch = (search: string) => {
  const values = STYLES.filter((style) => style.includes(search));

  return { values };
};

const Value: React.FC<{ value: string }> = ({ value }) => {
  return <>{value}</>;
};

const useGeoFields = (dataset: State.Dataset): string[] => {
  return useMemo(() => {
    return dataset.sampleFields
      .filter((f) => f.embeddedDocType === "fiftyone.core.labels.GeoLocation")
      .map(({ name }) => name)
      .sort();
  }, [dataset]);
};

const Plot: React.FC<{
  coordinates: [number, number][];
  id: string;
  samples: string[];
  style: string;
}> = ({ coordinates, id, samples, style }) => {
  const initialized = useRef(false);
  const deferred = deferrer(initialized);
  const bounds = useMemo(
    () =>
      coordinates.reduce(
        (bounds, latLng) => bounds.extend([latLng[1], latLng[0]]),
        new mapboxgl.LngLatBounds()
      ),
    []
  );

  const layout = useMemo(() => {
    const center = bounds.getCenter();

    return {
      mapbox: {
        style,
        center: {
          lat: center.lat,
          lon: center.lng,
        },
      },
      margin: { r: 0, t: 0, b: 0, l: 0 },
    };
  }, [bounds, coordinates]);

  const data = useMemo(
    () => [
      {
        type: "scattermapbox",
        lat: coordinates.map((latLng) => latLng[0]),
        lon: coordinates.map((latLng) => latLng[1]),
        marker: {
          color: COLOR,
          size: SIZE,
        },
      },
    ],
    [coordinates]
  );

  useEffect(() => {
    Plotly.newPlot(id, data, layout, {
      mapboxAccessToken: MAPBOX_ACCESS_TOKEN,
    }).then((plot) => {
      const map = plot._fullLayout.mapbox._subplot.map;

      map.once("zoomend", () => {
        let zoom = map.getZoom();
        plot._fullLayout.mapbox._subplot.viewInitial.zoom = zoom;
        Plotly.relayout(id, { "mapbox.zoom": zoom });
      });

      map.fitBounds([bounds.getNorthEast(), bounds.getSouthWest()], {
        padding: 20,
      });

      plot.on("plotly_click", (event) => {
        let sampleID = samples[event.points[0].pointIndex];
        console.log(`Clicked sample: ${sampleID}`);
      });

      plot.on("plotly_selected", (event) => {
        let sampleIDs = event.points.map(
          (point) => sampleIDs[point.pointIndex]
        );
        console.log(`Selected ${sampleIDs.length} samples: ${sampleIDs}`);
      });
    });
  }, [id]);

  useEffect(
    deferred(() => {
      Plotly.update(id, data, layout).then((plot) => {
        const map = plot._fullLayout.mapbox._subplot.map;

        map.fitBounds([bounds.getNorthEast(), bounds.getSouthWest()], {
          padding: 20,
        });
      });
    }),
    [id, bounds, data, layout]
  );

  useEffect(() => {
    initialized.current = true;
  }, []);

  return <div className={map} id={id}></div>;
};

const Map: React.FC<{
  dataset: State.Dataset;
  filters: State.Filters;
  view: State.Stage[];
}> = ({ dataset, filters, view }) => {
  const [id] = useState(() => uuid());
  const theme = useTheme();

  const fields = useGeoFields(dataset);

  const [activeField, setActiveField] = useState(() => fields[0]);

  const { loading, coordinates, samples } = useGeoLocations({
    dataset,
    filters,
    view,
    path: activeField,
  });

  const [style, setStyle] = useState("streets");

  const mapStyleChange = useCallback(
    (style: string) => {
      Plotly.relayout(id, { "mapbox.style": MAP_STYLES[style] });
      setStyle(style);
    },
    [id, style]
  );

  const selectorStyle = {
    background: theme.backgroundTransparent,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    padding: "0.25rem",
  };

  return (
    <div className={container}>
      {loading ? (
        <Loading>Pixelating</Loading>
      ) : (
        <Plot
          id={id}
          coordinates={coordinates}
          samples={samples}
          style={style}
        />
      )}
      <div className={options}>
        <foc.Selector
          placeholder={"Map Style"}
          value={style}
          onSelect={mapStyleChange}
          useSearch={useSearch}
          component={Value}
          containerStyle={selectorStyle}
          overflow={true}
        />
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
      </div>
    </div>
  );
};

export default Map;
