import type { PaginateSamplesNode } from "@fiftyone/relay";
import { ImaVidFrameSamples } from "./ima-vid-frame-samples";

export type SampleId = string;
export type SampleResponse = PaginateSamplesNode;
export type PartitionId = string;

export type ImaVidStore = {
  [partitionSampleId: string]: ImaVidFrameSamples;
};
