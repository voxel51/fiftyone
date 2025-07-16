import { LngLatBounds } from "mapbox-gl";

export interface MapSelection {
  polygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
  selectedIds: string[];
  field: string | null;
  setPolygon: (polygon: GeoJSON.Feature<GeoJSON.Polygon> | null, fieldOverride?: string) => void;
  setSelectedIds: (selectedIds: string[]) => void;
}