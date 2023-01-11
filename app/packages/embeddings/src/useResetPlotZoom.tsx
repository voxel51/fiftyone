import { usePanelStatePartial } from "@fiftyone/spaces";

export const useZoomRevision = () => usePanelStatePartial("zoomRevision", 0);
export function useResetPlotZoom() {
  const [zoomRevision, setZoomRevision] = useZoomRevision();
  const reset = () => {
    setZoomRevision((rev) => (rev ? rev + 1 : 1));
  };

  return reset;
}
