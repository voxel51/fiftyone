import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import React from "react";

export type SampleLocationMap = {
  [key: string]: [number, number];
};

const MAX_GEO_LOCATIONS_CACHE_SIZE = 5;
const MAX_GEO_LOCATIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

/**
 * Cache for geo location responses to avoid making duplicate requests
 */
const geoLocationsCache = new LRUCache<string, SampleLocationMap>({
  max: MAX_GEO_LOCATIONS_CACHE_SIZE,
  ttl: MAX_GEO_LOCATIONS_CACHE_TTL,
});

const fetchGeoLocations = async (params: {
  filters: fos.State.Filters;
  view: fos.State.Stage[];
  extended: typeof fos.extendedStages;
  dataset: string;
  path: string;
}): Promise<SampleLocationMap> => {
  try {
    const response = await getFetchFunction()("POST", "/geo", params);
    return response as SampleLocationMap;
  } catch (error) {
    console.error(error);
    return {};
  }
};

const useGeoLocations = ({
  path,
  dataset,
  filters,
  extended,
  view,
}: {
  path: string;
  dataset: fos.State.Dataset;
  view: fos.State.Stage[];
  extended: typeof fos.extendedStages;
  filters: fos.State.Filters;
}): {
  loading: boolean;
  sampleLocationMap: SampleLocationMap;
} => {
  const [loading, setLoading] = React.useState(false);
  const [sampleLocationMap, setSampleLocationMap] =
    React.useState<SampleLocationMap>({});

  const key = React.useMemo(() => {
    return [
      dataset.name,
      JSON.stringify(filters),
      JSON.stringify(view),
      JSON.stringify(extended),
      path,
    ].join("-");
  }, [dataset, filters, view, path, extended]);

  React.useEffect(() => {
    setLoading(true);

    // Check if response is already in cache
    if (geoLocationsCache.has(key)) {
      const cachedResponse = geoLocationsCache.get(key);
      if (cachedResponse) {
        setSampleLocationMap(cachedResponse);
        setLoading(false);
        return;
      }
    }

    // Otherwise fetch from server
    fetchGeoLocations({
      filters,
      view,
      extended,
      dataset: dataset.name,
      path,
    }).then((res) => {
      geoLocationsCache.set(key, res);
      setSampleLocationMap(res);
      setLoading(false);
    });
  }, [key, dataset, filters, view, path, extended]);

  return {
    loading,
    sampleLocationMap,
  };
};

export default useGeoLocations;
