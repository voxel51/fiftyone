import { useEffect } from "react";
import { useTiling } from "./TilingProvider";
import { saveLayout } from "./layout-storage";

/**
 * Persists the mosaic layout to localStorage whenever it changes, keyed by
 * `datasetId`. Call this inside any component that is a descendant of
 * `TilingProvider`.
 *
 * Use `loadLayout` (from `layout-storage`) to read the saved value back at
 * mount time and pass it as `initialLayout` to `TilingProvider`.
 *
 * No-ops when `datasetId` is `undefined`.
 */
export function useTilingLayoutPersistence(
  datasetId: string | undefined
): void {
  const { layout } = useTiling();

  useEffect(() => {
    saveLayout(datasetId, layout);
  }, [datasetId, layout]);
}
