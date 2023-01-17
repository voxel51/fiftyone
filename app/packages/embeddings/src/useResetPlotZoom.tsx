import { usePanelStatePartial } from "@fiftyone/spaces";

export const useZoomRevision = () => usePanelStatePartial("zoomRevision", 0);
export function useResetPlotZoom() {
  const [zoomRevision, setZoomRevision] = useZoomRevision();
  const reset = () => {
    setZoomRevision((rev) => (typeof rev === "number" ? rev + 1 : 1));
  };

  return reset;
}
