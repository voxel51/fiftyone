import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";
import {
  DETECTION,
  DETECTIONS,
  getColor,
  getFetchFunction,
  HEATMAP,
  SEGMENTATION,
} from "@fiftyone/utilities";
import { decode } from "fast-png";
import { NumpyResult } from "../numpy";
import { BaseState } from "../state";
import { createWorker } from "../util";
import { BaseLabel, Overlay } from "./base";

const DENSE_LABEL_PLURALS = [DETECTIONS] as const;
type DENSE_LABEL_PLURALS_T = typeof DENSE_LABEL_PLURALS[number];

const DENSE_LABEL_PRIMITIVES = [SEGMENTATION, HEATMAP, DETECTION] as const;
type DENSE_LABEL_PRIMITIVES_T = typeof DENSE_LABEL_PRIMITIVES[number];

// todo: when https://github.com/microsoft/TypeScript/pull/50528 is available in TS, derive enum values from constants
enum DenseLabelTypeFieldNames {
  DETECTIONS = "detections",
  DETECTION = "detection",
  HEATMAP = "heatmap",
  SEGMENTATION = "segmentation",
}

type DenseLabelPrimitive = Omit<BaseLabel, "_cls"> & {
  _cls: DENSE_LABEL_PRIMITIVES_T;
} & {
  mask_path?: string;
} & {
  [_ in "map" | "mask"]?: {
    data: NumpyResult;
    image: ArrayBuffer;
  };
};

type DenseLabelPlural = {
  [pluralDenseLabelFieldName in "detections"]?: DenseLabelPrimitive[];
} & { _cls: DENSE_LABEL_PLURALS_T } & Omit<BaseLabel, "_cls">;

type DenseLabel = DenseLabelPrimitive | DenseLabelPrimitive;

const denseOverlayWorkerCallbacks = {
  requestColor: [
    (worker, { key, pool, seed }) => {
      debugger;
      worker.postMessage({
        method: "resolveColor",
        key,
        seed,
        color: getColor(pool, seed, key),
      });
    },
  ],
};

export const getDenseOverlayWorker = (() => {
  // one labels worker seems to be best
  // const numWorkers = navigator.hardwareConcurrency || 4;
  const numWorkers = 1;
  let workers: Worker[];

  let next = -1;
  return (dispatchEvent) => {
    if (!workers) {
      workers = [];
      for (let i = 0; i < numWorkers; i++) {
        workers.push(createWorker(denseOverlayWorkerCallbacks, dispatchEvent));
      }
    }

    next++;
    next %= numWorkers;
    return workers[next];
  };
})();

// exploiting TS's declaration merging so that abstract class doesn't have to implement all methods in interface
export interface DenseOverlay<State extends BaseState> extends Overlay<State> {}
export abstract class DenseOverlay<State extends BaseState>
  implements Overlay<State>
{
  processed: boolean;

  constructor() {
    this.processed = false;
  }

  async imputeOverlayFromPath(label: DenseLabel) {
    if (DENSE_LABEL_PLURALS.includes(label._cls as DENSE_LABEL_PLURALS_T)) {
      let label: DenseLabelPlural;
      label[
        label._cls.toLocaleLowerCase() as DenseLabelTypeFieldNames.DETECTIONS
      ].forEach((primitive) => this.imputeOverlayFromPath(primitive));
    } else {
      // overlay path is in `map_path` property for heatmap, or else, it's in `mask_path` property
      const overlayPathField =
        label._cls === HEATMAP ? "map_path" : "mask_path";
      const overlayField = overlayPathField === "map_path" ? "map" : "mask";

      if (label[overlayField] || !label[overlayPathField]) {
        return;
      }

      // convert absolute file path to a URL that we can "fetch" from
      const overlayPngImageUrl = getSampleSrc(
        label[overlayPathField] as string
      );

      const pngArrayBuffer: ArrayBuffer = await getFetchFunction()(
        "GET",
        overlayPngImageUrl,
        null,
        "arrayBuffer"
      );
      const overlayData = decode(pngArrayBuffer);

      const width = overlayData.width;
      const height = overlayData.height;

      // frame what we have as a specialized type `NumpyResult` that's used in downstream while processing overlays
      const data: NumpyResult = {
        shape: [height, width],
        buffer: overlayData.data.buffer,
        arrayType: overlayData.data.constructor
          .name as NumpyResult["arrayType"],
      };

      // set the `mask` property for this label
      label[overlayField] = {
        data,
        image: new ArrayBuffer(width * height * 4),
      };
    }
  }
}
