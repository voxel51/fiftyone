import * as foq from "@fiftyone/relay";
import { Environment, Subscription, fetchQuery } from "relay-runtime";
import { Sample } from "../..";
import { ImaVidStore } from "./store";
import { ImaVidFrameSamples } from "./types";

const IMAVID_BUFFER_SIZE = 100;

/**
 * I need from React:
 * 1. groupByFieldValue
 * 2. dynamicGroupPageSelector(groupByFieldValue)
 * 3. recoil environment
 */
export class ImaVidFramesController {
  private subscription: Subscription;

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

  public cleanup() {
    try {
      this.subscription?.unsubscribe();
    } catch {}
  }

  public async fetchMore(cursor: number, limit = IMAVID_BUFFER_SIZE) {
    const variables = this.page(cursor, limit);

    return new Promise<void>((resolve, _reject) => {
      // do a gql query here, get samples, update store
      this.subscription = fetchQuery<foq.paginateSamplesQuery>(
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

              if (!ImaVidStore.has(this.posterSampleId)) {
                ImaVidStore.set(this.posterSampleId, new ImaVidFrameSamples());
              }

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
  }

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
