import * as foq from "@fiftyone/relay";
import { ImaVidFrameSamples } from "./ima-vid-frame-samples";

export type SampleId = string;
export type SampleResponse =
  foq.paginateSamplesQuery$data["samples"]["edges"][number]["node"];
export type PartitionId = string;

export type ImaVidStore = {
  [partitionSampleId: string]: ImaVidFrameSamples;
};
