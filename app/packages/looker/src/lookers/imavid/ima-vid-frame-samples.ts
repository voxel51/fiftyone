import LRUCache from "lru-cache";
import { MAX_FRAME_SAMPLES_CACHE_SIZE } from "./constants";
import { SampleId, SampleResponse } from "./types";

export class ImaVidFrameSamples {
  public readonly samples: LRUCache<SampleId, SampleResponse>;
  public readonly frameIndex: Map<number, string>;
  public readonly reverseFrameIndex: Map<string, number>;

  constructor() {
    this.samples = new LRUCache<SampleId, SampleResponse>({
      max: MAX_FRAME_SAMPLES_CACHE_SIZE,
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
