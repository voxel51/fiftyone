import * as fos from "@fiftyone/looker/src/state";
import { SampleData } from "@fiftyone/state";

const RENDERABLE = ["Detection", "Polyline"];
const RENDERABLE_LIST = ["Detections", "Polylines"];

export type OverlayLabel = {
  _id: string;
  _cls: string;
  path: string[];
  selected: boolean;
  color?: string;
  label?: string;
  sampleId?: string;
};

export const load3dOverlayForSample = (
  sampleId: string,
  samples: SampleData | fos.Sample[],
  selectedLabels: Record<string, unknown>,
  currentPath = []
) => {
  let overlays: OverlayLabel[] = [];

  const labelKeys = Array.isArray(samples) ? null : Object.keys(samples);
  const labelValues = Array.isArray(samples) ? samples : Object.values(samples);

  for (let i = 0; i < labelValues.length; i++) {
    const label = labelValues[i];
    const labelKey = labelKeys ? labelKeys[i] : "";
    if (!label) {
      continue;
    }

    if (RENDERABLE.includes(label._cls)) {
      overlays.push({
        ...label,
        sampleId,
        path: [...currentPath, labelKey].filter((k) => !!k),
        selected: label._id in selectedLabels,
      });
    } else if (RENDERABLE_LIST.includes(label._cls)) {
      overlays = [
        ...overlays,
        ...load3dOverlayForSample(
          sampleId,
          label[label._cls.toLowerCase()],
          selectedLabels,
          labelKey ? [...currentPath, labelKey] : [...currentPath]
        ),
      ];
    }
  }

  return overlays;
};

export const load3dOverlays = (
  samples: { [sliceOrFilename: string]: SampleData } | fos.Sample[],
  selectedLabels: Record<string, unknown>,
  currentPath = []
) => {
  const overlays = [];
  for (const [_sliceOrFilename, sampleWrapper] of Object.entries(samples)) {
    if (!sampleWrapper?.sample?._id) {
      return;
    }

    overlays.push(
      load3dOverlayForSample(
        sampleWrapper.sample._id,
        sampleWrapper.sample,
        selectedLabels,
        currentPath
      )
    );
  }

  return overlays.flat();
};
