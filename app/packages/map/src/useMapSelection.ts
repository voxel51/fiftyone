import { useCallback, useState } from "react";
import { LngLatBounds } from "mapbox-gl";
import { useRecoilState, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { useResetExtendedSelection } from "@fiftyone/state";
import { MapSelection } from "./types";
import { SELECTION_SCOPE } from "./constants";
import * as state from './state';

// Import GeoSelection type from state package
type GeoSelection = {
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
  field: string;
};

function useMapSelection(): MapSelection {
  const [polygon, setPolygon] = useState<GeoJSON.Feature<GeoJSON.Polygon> | null>(null);
  const field = useRecoilValue(state.activeField);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  return {
    polygon,
    field,
    selectedIds,
    setPolygon,
    setField,
    setSelectedIds,
  }
}

export default useMapSelection;

