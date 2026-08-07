import type * as fos from "@fiftyone/looker/src/state";
import type { ModalSample } from "@fiftyone/state";
import {
  LABEL_LIST,
  type LabelData,
  type Schema,
  getCls,
} from "@fiftyone/utilities";

const RENDERABLE = ["Detection", "Polyline"];
const RENDERABLE_LIST = ["Detections", "Polylines"];

/**
 * The persistable document of a 3D overlay — exactly what is stored on the
 * sample and what the annotation engine's `LabelData` contract carries.
 * View state never lives here (see {@link Overlay3DUiState}), so user
 * attributes can use any name without colliding with UI bookkeeping.
 */
export type Overlay3DDocument = LabelData & {
  label?: string;
  tags?: string[];

  /**
   * Unlike id, instanceId is not guaranteed to be unique across samples.
   * It is only guaranteed to be unique within a sample.
   *
   * It is commonly used to cross-link labels between samples.
   */
  instance?: {
    _cls: "Instance";
    _id: string;
  };
};

/**
 * View state carried alongside (never inside) an overlay's document.
 */
export interface Overlay3DUiState {
  selected: boolean;
  /** Resolved render color from the coloring scheme. */
  color?: string;
  /** True if this label only exists in staged transforms (newly created). */
  isNew?: boolean;
}

/**
 * A loaded 3D overlay: the label document plus addressing and view state,
 * mirroring the sidebar's `AnnotationLabel` and Lighter's `overlay.label`
 * pattern — the document nests under `label`, everything else wraps it.
 */
export type OverlayLabel = {
  label: Overlay3DDocument;
  path: string;
  sampleId: string;
  ui: Overlay3DUiState;
};

export const load3dOverlayForSample = (
  sampleId: string,
  samples: fos.Sample | fos.Sample[],
  selectedLabels: Record<string, unknown>,
  currentPath: string[] = [],
  schema: Schema,
  rest: string[] = [],
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
        label: label as Overlay3DDocument,
        sampleId,
        path,
        ui: { selected: label._id in selectedLabels },
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
          [LABEL_LIST[cls]],
        ),
      ];
    }
  }

  return overlays;
};

export const load3dOverlays = (
  samples: { [sliceOrFilename: string]: ModalSample } | fos.Sample[],
  selectedLabels: Record<string, unknown>,
  currentPath: string[] = [],
  schema: Schema,
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
        schema,
      ),
    );
  }

  return overlays.flat();
};
