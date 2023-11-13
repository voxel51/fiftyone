import LRUCache from "lru-cache";
import { MAX_FRAME_SAMPLES_CACHE_SIZE } from "./constants";
import { SampleId, SampleResponse } from "./types";
import { BufferManager } from "./buffer-manager";

export class ImaVidFrameSamples {
  public readonly samples: LRUCache<SampleId, SampleResponse>;
  public readonly frameIndex: Map<number, SampleId>;
  public readonly reverseFrameIndex: Map<SampleId, number>;

  private readonly storeBufferManager: BufferManager;

  constructor(storeBufferManager: BufferManager) {
    this.storeBufferManager = storeBufferManager;

    this.samples = new LRUCache<SampleId, SampleResponse>({
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
    });

    this.frameIndex = new Map<number, string>();
    this.reverseFrameIndex = new Map<string, number>();
  }

  reset() {
    this.frameIndex.clear();
    this.reverseFrameIndex.clear();
    this.samples.reset();
  }
}
