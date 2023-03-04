import * as fos from "@fiftyone/looker/src/state";

const RENDERABLE = ["Detection", "Polyline"];
const RENDERABLE_LIST = ["Detections", "Polylines"];

export type OverlayLabel = {
  _id: string;
  _cls: string;
  path: string[];
  selected: boolean;
  color?: string;
  label?: string;
};

export const load3dOverlays = (
  sample: fos.Sample | fos.Sample[],
  selectedLabels: Record<string, unknown>,
  currentPath = []
) => {
  let overlays: OverlayLabel[] = [];
  const labels = Array.isArray(sample) ? sample : Object.values(sample);
  const labelKeys = Array.isArray(sample) ? null : Object.keys(sample);

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const labelKey = labelKeys ? labelKeys[i] : "";
    if (!label) {
      continue;
    }

    // Note: this logic is not quite right
    // this is hardcoded to match the kitti dataset
    // it should change to be dataset agnostic!
    if (RENDERABLE.includes(label._cls)) {
      overlays.push({
        ...label,
        path: [...currentPath, labelKey].filter((k) => !!k),
        selected: label._id in selectedLabels,
      });
    } else if (RENDERABLE_LIST.includes(label._cls)) {
      overlays = [
        ...overlays,
        ...load3dOverlays(
          label[label._cls.toLowerCase()],
          selectedLabels,
          labelKey ? [...currentPath, labelKey] : [...currentPath]
        ),
      ];
    }
  }

  return overlays;
};
