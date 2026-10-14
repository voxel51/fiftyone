import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import React from "react";
import { atom, useSetRecoilState } from "recoil";

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

export const sampleLocationMapAtom = atom<SampleLocationMap | null>({
  key: "sampleLocationMap",
  default: {},
});

const fetchGeoLocations = async (params: {
  filters: object | null;
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

const useFetchGeoLocations = ({
  path,
  dataset,
  filters,
  extended,
  view,
  revision,
}: {
  path: string;
  revision: number;
  dataset: fos.State.Dataset;
  view: fos.State.Stage[];
  extended: typeof fos.extendedStages;
  filters: object | null;
}): {
  loading: boolean;
} => {
  const [loading, setLoading] = React.useState(false);
  const setSampleLocationMap = useSetRecoilState(sampleLocationMapAtom);

  const key = React.useMemo(() => {
    return [
      dataset.name,
      JSON.stringify(filters),
      JSON.stringify(view),
      JSON.stringify(extended),
      path,
      revision,
    ].join("-");
  }, [dataset, filters, view, path, extended, revision]);

  // This effect reloads locations when the grid scope changes. An older
  // request may populate the cache, but cannot replace the current map.
  React.useEffect(() => {
    const cached = geoLocationsCache.get(key);
    if (cached) {
      setSampleLocationMap(cached);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    fetchGeoLocations({
      filters,
      view,
      extended,
      dataset: dataset.name,
      path,
    }).then((res) => {
      geoLocationsCache.set(key, res);
      if (active) {
        setSampleLocationMap(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [key, dataset, filters, view, path, extended, revision]);

  return {
    loading,
  };
};

export default useFetchGeoLocations;
