import { ModalSample, getNormalizedUrls, getSampleSrc } from "@fiftyone/state";
import {
  BufferManager,
  DETECTION,
  DETECTIONS,
  HEATMAP,
  SEGMENTATION,
  sizeBytesEstimate,
} from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import { getSampleWithResettedMasks } from ".";
import {
  MAX_FRAME_STREAM_SIZE,
  MAX_FRAME_STREAM_SIZE_BYTES,
} from "../../constants";
import { RENDER_STATUS_PENDING } from "../../worker/shared";
import { SampleId } from "./types";

const BASE64_BLACK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAABNJREFUCB1jZGBg+A/EDEwgAgQADigBA//q6GsAAAAASUVORK5CYII=";

export type ModalSampleExtendedWithImage = ModalSample & {
  image: HTMLImageElement;
};

// every live frame-samples instance, so an eviction from the shared store below
// can drop the sample from each controller's per-group frame index + buffer
const frameSampleInstances = new Set<ImaVidFrameSamples>();

// A SINGLE sample cache shared by every imavid controller (grid + modal), keyed
// by the bare sample `_id`. Frames fetched (and decoded images) for grid hover
// are reused by the modal — and vice-versa — with no backend re-fetch. Bounded by
// the same count/byte limits the old per-controller cache used.
export const ImaVidSampleStore = new LRUCache<
  SampleId,
  ModalSampleExtendedWithImage
>({
  max: MAX_FRAME_STREAM_SIZE,
  maxSize: MAX_FRAME_STREAM_SIZE_BYTES,
  noDisposeOnSet: true,
  // count the image too (encoded JPEG ≈ w*h/8); entries are re-set after the
  // image attaches so the byte budget tracks real memory, not just field JSON
  sizeCalculation: (data) =>
    Math.max(
      1,
      Math.ceil(
        sizeBytesEstimate(data.sample) +
          (data.image?.naturalWidth
            ? (data.image.naturalWidth * data.image.naturalHeight) / 8
            : 0),
      ),
    ),
  dispose: (_data, sampleId, reason) => {
    if (reason === "evict") {
      // real LRU pressure (count or byte budget) — sustained streams of these
      // mean the frame JSON is too heavy for the budget (inline masks)
      console.debug(
        "[imavid] store evict",
        sampleId,
        `${ImaVidSampleStore.size} entries`,
        `${Math.round(ImaVidSampleStore.calculatedSize / 1e6)}MB`,
      );
    }
    // an evicted sample is no longer buffered for any controller that indexed it
    for (const instance of frameSampleInstances) {
      instance.forget(sampleId);
    }
  },
});

export class ImaVidFrameSamples {
  // the shared, `_id`-keyed sample store (same instance for every controller)
  public readonly samples: LRUCache<SampleId, ModalSampleExtendedWithImage>;

  public readonly frameIndex: Map<number, SampleId>;
  public readonly reverseFrameIndex: Map<SampleId, number>;

  private readonly storeBufferManager: BufferManager;

  // scopes in-flight image listeners; replaced on abort so a revived
  // controller's future fetches get a live signal
  private abortController: AbortController;

  constructor(storeBufferManager: BufferManager) {
    this.storeBufferManager = storeBufferManager;
    this.abortController = new AbortController();

    this.samples = ImaVidSampleStore;

    this.frameIndex = new Map<number, string>();
    this.reverseFrameIndex = new Map<string, number>();

    frameSampleInstances.add(this);
  }

  /**
   * Drop a sample from THIS controller's frame index + buffer. Called when the
   * shared store evicts it, so a controller never reports a frame as buffered
   * whose data is gone.
   */
  forget(sampleId: SampleId) {
    const frameNumber = this.reverseFrameIndex.get(sampleId);
    if (frameNumber !== undefined) {
      this.frameIndex.delete(frameNumber);
      this.storeBufferManager.removeBufferValue(frameNumber);
    }
    this.reverseFrameIndex.delete(sampleId);
  }

  getSampleAtFrame(frameNumber: number) {
    const sampleId = this.frameIndex.get(frameNumber);
    if (sampleId === undefined) {
      return undefined;
    }

    return this.samples.get(sampleId);
  }

  /**
   * Cancel every in-flight image download (teardown / view switch): the
   * browser drops the network fetch, each pending promise settles, and future
   * fetches attach to a fresh signal.
   */
  abortInFlightImages() {
    this.abortController.abort();
    this.abortController = new AbortController();
  }

  async fetchImageForSample(
    sampleId: string,
    urls: ModalSample["urls"],
    mediaField: string,
  ): Promise<string> {
    const normalizedUrls = getNormalizedUrls(urls);
    const image = new Image();
    const source = getSampleSrc(normalizedUrls[mediaField]);
    const signal = this.abortController.signal;

    return new Promise((resolve) => {
      // teardown: cancel the download and settle so no fetch loop ever awaits
      // a dead image
      signal.addEventListener(
        "abort",
        () => {
          image.src = "";
          resolve(sampleId);
        },
        { once: true },
      );
      image.addEventListener(
        "load",
        () => {
          const sample = this.samples.get(sampleId);

          if (!sample) {
            // evicted (or store reset) while the image was in flight — routine
            // under memory pressure / view churn. MUST still resolve: an
            // unsettled promise wedges the chunk's Promise.all and strands the
            // controller's fetch loop. The frame refetches when the playhead
            // nears it (runway-gated).
            console.debug(
              "[imavid] sample evicted before image loaded",
              sampleId,
            );
            resolve(sampleId);
            return;
          }

          sample.image = image;
          // re-set so the LRU's byte accounting includes the image
          this.samples.set(sampleId, sample);
          resolve(sampleId);
        },
        { signal: this.abortController?.signal },
      );

      image.addEventListener(
        "error",
        () => {
          console.error(
            "Failed to load image for sample with id",
            sampleId,
            "at url",
            source,
          );

          // placeholder so a failed image never blocks animation; resolve so
          // the chunk's Promise.all never hangs on a failed url
          image.src = BASE64_BLACK_IMAGE;
          resolve(sampleId);
        },
        { signal: this.abortController?.signal },
      );

      image.src = source;
    });
  }

  /**
   * Update sample metadata in the store.
   * This doesn't update the media associated with the sample.
   * Useful for tagging, etc.
   */
  updateSample(id: string, newSample: ModalSampleExtendedWithImage["sample"]) {
    const oldSample = this.samples.get(id);

    if (!oldSample) {
      return;
    }

    this.samples.set(id, {
      ...oldSample,
      sample: { ...newSample },
    });
  }

  /**
   * Reset the masks for a sample to the given render status.
   */
  resetMaskForSample(
    sample: ModalSampleExtendedWithImage,
    _newRenderStatus = RENDER_STATUS_PENDING,
  ) {
    this.updateSample(
      sample.id ?? sample.sample._id,
      getSampleWithResettedMasks(sample.sample),
    );
  }

  /**
   * Reset the masks for a frame to the given render status.
   */
  resetMaskForFrame(
    frameNumber: number,
    newRenderStatus = RENDER_STATUS_PENDING,
  ) {
    const sampleId = this.frameIndex.get(frameNumber);
    if (!sampleId) {
      return;
    }
    this.resetMaskForSample(this.samples.get(sampleId), newRenderStatus);
  }

  /**
   * Reset the masks for all samples to the given render status.
   */
  resetMasks(renderStatus: string = RENDER_STATUS_PENDING) {
    // only this controller's frames — the sample store is shared across controllers
    for (const sampleId of this.reverseFrameIndex.keys()) {
      const sample = this.samples.get(sampleId);
      if (sample) {
        this.resetMaskForSample(sample, renderStatus);
      }
    }
  }

  hasAtLeastOneLoadedMask(frameNumber: number) {
    const sampleId = this.frameIndex.get(frameNumber);
    if (!sampleId) {
      return false;
    }

    const sample = this.samples.get(sampleId);
    if (!sample) {
      return false;
    }

    const checkMask = (value) => {
      try {
        if (value.mask_path?.length && !value.mask?.bitmap?.width) {
          return true;
        } else if (value.map_path?.length && !value.map?.bitmap?.width) {
          return true;
        }
      } catch (e) {
        console.error("Error checking mask", e);
      }
      return false;
    };

    for (const [_field, value] of Object.entries(sample.sample)) {
      if (typeof value === "object" && value !== null && "_cls" in value) {
        if (value._cls === DETECTIONS) {
          const { detections } = value as {
            detections: Record<string, unknown>[];
          };
          for (const detection of detections) {
            if (checkMask(detection)) {
              return true;
            }
          }
        } else if (
          value._cls === DETECTION ||
          value._cls === HEATMAP ||
          value._cls === SEGMENTATION
        ) {
          return checkMask(value);
        }
      }
    }

    return false;
  }

  reset() {
    this.frameIndex.clear();
    this.reverseFrameIndex.clear();
    // do NOT clear the shared sample store — other controllers reuse its entries
    // by `_id` and it self-bounds via LRU; just stop receiving eviction callbacks
    frameSampleInstances.delete(this);
    this.storeBufferManager.reset();
    this.abortController.abort();
  }
}
