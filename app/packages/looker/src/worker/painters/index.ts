import type { DetectionLabel } from "../../overlays/detection";
import type { IntermediateMask } from "../decoders/types";
import detection from "./detection";
import heatmap from "./heatmap";
import panoptic from "./panoptic";
import segmentation from "./segmentation";
import type { Painter } from "./utils";
import { requestColor, resolveColor } from "./utils";

type Detections = (request: typeof requestColor) => (
  params: Omit<Parameters<Painter<DetectionLabel>>[0], "label"> & {
    label: { detections: (DetectionLabel & { mask: IntermediateMask })[] };
  }
) => Promise<void>;

const detections: Detections =
  (request: typeof requestColor) =>
  async ({ label: labels, ...params }) => {
    if (!labels?.detections) {
      return;
    }

    const promises = labels.detections.map((label) =>
      createPainter(request).Detection({
        label,
        ...params,
      })
    );

    await Promise.all(promises);
  };

export const createPainter = (request: typeof requestColor) => ({
  Detection: detection,
  Detections: detections(request),
  Heatmap: heatmap,
  PanopticSegmentation: panoptic,
  Segmentation: segmentation,
});

export const painter = createPainter(requestColor);

export { resolveColor };
