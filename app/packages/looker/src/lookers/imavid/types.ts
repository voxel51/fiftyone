import * as foq from "@fiftyone/relay";
import LRUCache from "lru-cache";

export type SampleId = string;
export type SampleResponse =
  foq.paginateSamplesQuery$data["samples"]["edges"][number]["node"];
export type PartitionSampleId = string;

export type ImaVidStore = {
  [partitionSampleId: string]: ImaVidFrameSamples;
};

export class ImaVidFrameSamples {
  public readonly samples: LRUCache<SampleId, SampleResponse>;
  public readonly frameIndex: Map<number, string>;

  constructor() {
    this.samples = new LRUCache<SampleId, SampleResponse>({
      max: 500,
    });

    this.frameIndex = new Map<number, string>();
  }

  reset() {
    this.frameIndex.clear();
    this.samples.reset();
  }
}
