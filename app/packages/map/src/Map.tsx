import styles from "./Map.module.css";

import * as foc from "@fiftyone/components";
import { usePluginSettings } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import contains from "@turf/boolean-contains";
import { debounce } from "lodash";
import React from "react";

import { useRecoilState, useRecoilValue } from "recoil";
import useResizeObserver from "use-resize-observer";

import useFetchGeoLocations, {
  SampleLocationMap,
  sampleLocationMapAtom,
} from "./useFetchGeoLocations";

import { useSetPanelCloseEffect } from "@fiftyone/spaces";
import {
  useBeforeScreenshot,
  useResetExtendedSelection,
} from "@fiftyone/state";
import { SELECTION_SCOPE } from "./constants";
import Options from "./Options";
import { getMapProvider } from "./basemaps";
import MapRenderer, { type MapBounds, type MapHandle } from "./MapRenderer";
import {
  activeField,
  defaultSettings,
  mapboxStyle,
  maplibreStyle,
  type MapSettings,
} from "./state";

const computeBounds = (
  data: GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }>,
) => {
  const [first, ...coordinates] = data.features.map(
    ({ geometry }) => geometry.coordinates as [number, number],
  );

  return coordinates.reduce<MapBounds>(
    ([[west, south], [east, north]], [longitude, latitude]) => [
      [Math.min(west, longitude), Math.min(south, latitude)],
      [Math.max(east, longitude), Math.max(north, latitude)],
    ],
    [first, first],
  );
};

const createSourceData = (
  sampleLocationMap: SampleLocationMap,
): GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }> => {
  const entries = Object.entries(sampleLocationMap);
  if (entries.length === 0) return null;

  return {
    type: "FeatureCollection",
    features: entries.map(([id, coordinates]) => ({
      type: "Feature",
      properties: { id },
      geometry: { type: "Point", coordinates },
    })),
  };
};

const Panel: React.FC<{}> = () => {
  const theme = foc.useTheme();
  const dataset = useRecoilValue(fos.dataset);
  const view = useRecoilValue(fos.view);
  const filters = useRecoilValue(fos.filters);
  const unFilteredExtended = useRecoilValue(fos.extendedStages);

  const extended = React.useMemo(() => {
    return Object.fromEntries(
      Object.entries(unFilteredExtended).filter(([stageName]) => {
        // we remove select stage because we id-match client side
        // we could do it in the server but with large number of samples,
        // we'll hit mongo aggregation limits.
        // We still want to pass in other extended stages
        // like similarity search, etc.
        return stageName !== "fiftyone.core.stages.Select";
      }),
    ) as unknown as typeof fos.extendedStages;
  }, [unFilteredExtended]);

  const currentField = useRecoilValue(activeField);

  const { loading } = useFetchGeoLocations({
    dataset,
    filters,
    view,
    extended,
    path: currentField,
  });
  const sampleLocationMap = useRecoilValue(sampleLocationMapAtom);

  const settings = usePluginSettings<MapSettings>("map", defaultSettings);

  const provider = getMapProvider(settings.mapboxAccessToken);
  const mapboxStyleValue = useRecoilValue(mapboxStyle);
  const maplibreStyleValue = useRecoilValue(maplibreStyle);
  const style = provider === "mapbox" ? mapboxStyleValue : maplibreStyleValue;
  const [{ selection }, setExtendedSelection] = useRecoilState(
    fos.extendedSelection,
  );
  const resetExtendedSelection = useResetExtendedSelection();

  const mapRef = React.useRef<MapHandle>(null);
  const onResize = React.useMemo(
    () =>
      debounce(
        () => {
          mapRef.current?.resize();
        },
        10,
        {
          trailing: true,
        },
      ),
    [],
  );

  const { ref } = useResizeObserver<HTMLDivElement>({
    onResize,
  });

  const data = React.useMemo(() => {
    let source = sampleLocationMap;

    if (selection?.length) {
      source = {};
      for (const id of selection) {
        if (sampleLocationMap[id]) {
          source[id] = sampleLocationMap[id];
        }
      }
    }
    return createSourceData(source);
  }, [sampleLocationMap, selection]);

  const onCreate = React.useCallback(
    (event) => {
      const {
        features: [polygon],
      } = event;
      const selected = new Set<string>();

      for (let index = 0; index < data.features.length; index++) {
        if (
          contains(
            polygon as GeoJSON.Feature<GeoJSON.Polygon>,
            data.features[index],
          )
        ) {
          selected.add(data.features[index].properties.id);
        }
      }

      if (!selected.size) {
        return;
      }

      setExtendedSelection({
        selection: Array.from(selected),
        spatialSelection: {
          polygon: polygon.geometry.coordinates,
          field: currentField,
        },
        scope: SELECTION_SCOPE,
      });
    },
    [data, setExtendedSelection],
  );

  const bounds = React.useMemo(() => data && computeBounds(data), [data]);

  const [draw] = React.useState(
    () =>
      new MapboxDraw({
        displayControlsDefault: false,
        defaultMode: "draw_polygon",
      }),
  );
  const [mapError, setMapError] = React.useState(false);

  const length = React.useMemo(
    () => Object.keys(sampleLocationMap).length,
    [sampleLocationMap],
  );

  React.useEffect(() => {
    mapRef.current?.fitBounds();
  }, [data, provider]);

  React.useEffect(() => {
    setMapError(false);
  }, [provider, style]);

  useBeforeScreenshot(() => {
    return mapRef.current.beforeScreenshot();
  });

  const setPanelCloseEffect = useSetPanelCloseEffect();
  React.useEffect(() => {
    setPanelCloseEffect(resetExtendedSelection);
  }, []);

  const noData = !length || !data;

  if (noData && !loading) {
    return <foc.Loading>No data</foc.Loading>;
  }

  return (
    <div className={styles.container} ref={ref}>
      {loading && !length ? (
        <foc.Loading style={{ opacity: 0.5 }}>Pixelating...</foc.Loading>
      ) : mapError ? (
        <foc.Loading>Something went wrong while loading the map</foc.Loading>
      ) : (
        <MapRenderer
          ref={mapRef}
          bounds={bounds}
          clusterColor={theme.primary.plainColor}
          data={data}
          draw={draw}
          mapboxAccessToken={settings.mapboxAccessToken}
          onCreate={onCreate}
          onError={(error) => {
            setMapError(true);
            throw error;
          }}
          provider={provider}
          settings={settings}
          style={style}
        />
      )}

      <Options
        fitData={() => mapRef.current?.fitBounds()}
        fitSelectionData={() => mapRef.current?.fitBounds()}
        clearSelectionData={resetExtendedSelection}
        provider={provider}
      />
    </div>
  );
};

export default Panel;
