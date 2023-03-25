import { usePanelStatePartial } from "@fiftyone/spaces";

export const useZoomRevision = () =>
  usePanelStatePartial("zoomRevision", 1, true);
export function useResetPlotZoom() {
  const [zoomRevision, setZoomRevision] = useZoomRevision();
  const reset = () => {
    setZoomRevision((rev) => (typeof rev === "number" ? rev + 1 : 2));
  };

  return reset;
}
