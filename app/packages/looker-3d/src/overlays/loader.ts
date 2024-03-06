import * as fos from "@fiftyone/looker/src/state";
import { SampleData } from "@fiftyone/state";
import { getCls, LABEL_LIST, Schema } from "@fiftyone/utilities";

const RENDERABLE = ["Detection", "Polyline"];
const RENDERABLE_LIST = ["Detections", "Polylines"];

export type OverlayLabel = {
  _id: string;
  path: string;
  selected: boolean;
  color?: string;
  label?: string;
  sampleId?: string;
  _cls: string;
};

export const load3dOverlayForSample = (
  sampleId: string,
  samples: SampleData | fos.Sample[],
  selectedLabels: Record<string, unknown>,
  currentPath: string[] = [],
  schema: Schema,
  rest: string[] = []
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

    const path = [...currentPath, labelKey].filter((k) => !!k).join(".");
    const cls = getCls([path, ...rest].join("."), schema);

    if (RENDERABLE.includes(cls)) {
      overlays.push({
        ...label,
        sampleId,
        path,
        selected: label._id in selectedLabels,
        _cls: cls,
      });
    } else if (RENDERABLE_LIST.includes(cls) && label[LABEL_LIST[cls]]) {
      overlays = [
        ...overlays,
        ...load3dOverlayForSample(
          sampleId,
          label[LABEL_LIST[cls]],
          selectedLabels,
          [...currentPath, labelKey],
          schema,
          [LABEL_LIST[cls]]
        ),
      ];
    }
  }

  return overlays;
};

export const load3dOverlays = (
  samples: { [sliceOrFilename: string]: SampleData } | fos.Sample[],
  selectedLabels: Record<string, unknown>,
  currentPath: string[] = [],
  schema: Schema
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
        currentPath,
        schema
      )
    );
  }

  return overlays.flat();
};
