import { Environment, fetchQuery } from "relay-runtime";
import { Sample } from "../..";
import { IMAVID_BUFFER_SIZE } from "./types";
import * as foq from "@fiftyone/relay";
import { ImaVidStore } from "./store";

/**
 * I need from React:
 * 1. groupByFieldValue
 * 2. dynamicGroupPageSelector(groupByFieldValue)
 * 3. recoil environment
 */
export class ImaVidFramesController {
  constructor(
    public readonly config: {
      posterSample: Sample;
      orderBy: string;
      page: any;
      environment: Environment;
    }
  ) {}

  get posterSample() {
    return this.config.posterSample;
  }

  get posterSampleId() {
    return this.config.posterSample._id;
  }

  get orderBy() {
    return this.config.orderBy;
  }

  get page() {
    return this.config.page;
  }

  get environment() {
    return this.config.environment;
  }

  public fetchMore = (cursor: number, limit = IMAVID_BUFFER_SIZE) => {
    debugger;
    const variables = this.page(cursor, limit);

    return new Promise<void>((resolve, _reject) => {
      // do a gql query here, get samples, update store
      const subscription = fetchQuery<foq.paginateSamplesQuery>(
        this.environment,
        foq.paginateSamples,
        variables
      ).subscribe({
        next: (data) => {
          if (data?.samples?.edges?.length) {
            // update store
            for (const { node } of data.samples.edges) {
              if (!node) {
                continue;
              }

              if (node.__typename !== "ImageSample") {
                throw new Error("only image samples supported");
              }

              const nodeSampleId = node.sample["_id"] as string;
              const frameNumber = node.sample[this.orderBy];

              ImaVidStore.get(this.posterSampleId).samples.set(
                node.sample["_id"],
                node
              );
              ImaVidStore.get(this.posterSampleId).indices.set(
                frameNumber,
                nodeSampleId
              );
            }
          }
          resolve();
        },
      });
    });
  };

  public async hydrateIfEmpty() {
    if (!this.posterSampleId) {
      throw new Error("poster sample invalid / not set");
    }

    console.log("Hydrating store for sample", this.posterSampleId);

    if (!ImaVidStore.has(this.posterSampleId)) {
      return this.fetchMore(0);
    }
  }
}
