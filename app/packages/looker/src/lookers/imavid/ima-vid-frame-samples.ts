import {
  ModalSample,
  getSampleSrc,
  getStandardizedUrls,
} from "@fiftyone/state";
import { BufferManager, sizeBytesEstimate } from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import {
  MAX_FRAME_STREAM_SIZE,
  MAX_FRAME_STREAM_SIZE_BYTES,
} from "../../constants";
import { SampleId } from "./types";

const BASE64_BLACK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAABNJREFUCB1jZGBg+A/EDEwgAgQADigBA//q6GsAAAAASUVORK5CYII=";

export type ModalSampleExtendedWithImage = ModalSample & {
  image: HTMLImageElement;
};
export class ImaVidFrameSamples {
  public readonly samples: LRUCache<SampleId, ModalSampleExtendedWithImage>;

  public readonly frameIndex: Map<number, SampleId>;
  public readonly reverseFrameIndex: Map<SampleId, number>;

  private readonly storeBufferManager: BufferManager;

  private readonly abortController: AbortController;

  constructor(storeBufferManager: BufferManager) {
    this.storeBufferManager = storeBufferManager;
    this.abortController = new AbortController();

    this.samples = new LRUCache<SampleId, ModalSampleExtendedWithImage>({
      dispose: (_modal, sampleId) => {
        // remove it from the frame index
        const frameNumber = this.reverseFrameIndex.get(sampleId);
        if (frameNumber !== undefined) {
          this.frameIndex.delete(frameNumber);
        }
        // remove from reverse frame index
        this.reverseFrameIndex.delete(sampleId);

        // remove from store buffer manager
        this.storeBufferManager.removeBufferValue(frameNumber);
      },
      max: MAX_FRAME_STREAM_SIZE,
      maxSize: MAX_FRAME_STREAM_SIZE_BYTES,
      noDisposeOnSet: true,
      sizeCalculation: (data) => sizeBytesEstimate(data.sample),
    });

    this.frameIndex = new Map<number, string>();
    this.reverseFrameIndex = new Map<string, number>();
  }

  getSampleAtFrame(frameNumber: number) {
    const sampleId = this.frameIndex.get(frameNumber);
    if (sampleId === undefined) {
      return undefined;
    }

    return this.samples.get(sampleId);
  }

  async fetchImageForSample(
    sampleId: string,
    urls: ModalSample["urls"],
    mediaField: string
  ): Promise<string> {
    const standardizedUrls = getStandardizedUrls(urls);
    const image = new Image();
    const source = getSampleSrc(standardizedUrls[mediaField]);

    return new Promise((resolve) => {
      image.addEventListener(
        "load",
        () => {
          const sample = this.samples.get(sampleId);

          if (!sample) {
            // sample was removed from the cache, this shouldn't happen...
            // but if it does, it might be because the cache was cleared
            // todo: handle this case better
            console.error(
              "Sample was removed from cache before image loaded",
              sampleId
            );
            image.src = BASE64_BLACK_IMAGE;
            return;
          }

          sample.image = image;
          resolve(sampleId);
        },
        { signal: this.abortController?.signal }
      );

      image.addEventListener(
        "error",
        () => {
          console.error(
            "Failed to load image for sample with id",
            sampleId,
            "at url",
            source
          );

          // use a placeholder blank black image to not block animation
          // setting src should trigger the load event
          image.src = BASE64_BLACK_IMAGE;
        },
        { signal: this.abortController?.signal }
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

  reset() {
    this.frameIndex.clear();
    this.reverseFrameIndex.clear();
    this.samples.clear();
    this.storeBufferManager.reset();
    this.abortController.abort();
  }
}
