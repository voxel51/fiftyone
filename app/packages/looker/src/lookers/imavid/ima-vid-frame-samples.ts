import { ModalSample } from "@fiftyone/state";
import LRUCache from "lru-cache";
import { BufferManager } from "./buffer-manager";
import { MAX_FRAME_SAMPLES_CACHE_SIZE } from "./constants";
import { SampleId } from "./types";

export class ImaVidFrameSamples {
  public readonly samples: LRUCache<SampleId, ModalSample>;
  public readonly frameIndex: Map<number, SampleId>;
  public readonly reverseFrameIndex: Map<SampleId, number>;

  private readonly storeBufferManager: BufferManager;

  constructor(storeBufferManager: BufferManager) {
    this.storeBufferManager = storeBufferManager;

    this.samples = new LRUCache<SampleId, ModalSample>({
      max: MAX_FRAME_SAMPLES_CACHE_SIZE,
      dispose: (sampleId) => {
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
      noDisposeOnSet: true,
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

  updateSample(id: string, newSample: ModalSample) {
    const oldSample = this.samples.get(id);
    if (oldSample) {
      this.samples.set(id, { ...oldSample, sample: newSample });
    }
  }

  reset() {
    this.frameIndex.clear();
    this.reverseFrameIndex.clear();
    this.samples.reset();
    this.storeBufferManager.reset();
  }
}
