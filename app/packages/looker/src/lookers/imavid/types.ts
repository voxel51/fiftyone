import * as foq from "@fiftyone/relay";
import LRUCache from "lru-cache";

export const IMAVID_BUFFER_SIZE = 100;

export type SampleId = string;
export type SampleResponse =
  foq.paginateSamplesQuery$data["samples"]["edges"][number]["node"];
export type PartitionSampleId = string;

export type ImaVidStore = {
  [partitionSampleId: string]: ImaVidFrameSamples;
};

export class ImaVidFrameSamples {
  public readonly samples: LRUCache<SampleId, SampleResponse>;
  public readonly indices: Map<string, string>;

  constructor() {
    this.samples = new LRUCache<SampleId, SampleResponse>({
      max: 500,
    });

    this.indices = new Map<string, string>();
  }

  reset() {
    this.indices.clear();
    this.samples.reset();
  }
}
