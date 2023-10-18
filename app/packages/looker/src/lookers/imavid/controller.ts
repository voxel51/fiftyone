import * as foq from "@fiftyone/relay";
import { Environment, Subscription, fetchQuery } from "relay-runtime";
import { Sample } from "../..";
import { ImaVidStore } from "./store";
import { ImaVidFrameSamples } from "./types";

const IMAVID_BUFFER_SIZE = 100;

export class ImaVidFramesController {
  private subscription: Subscription;

  constructor(
    private readonly config: {
      posterSample: Sample;
      orderBy: string;
      page: any;
      environment: Environment;
    }
  ) {}

  private get posterSampleId() {
    return this.config.posterSample._id;
  }

  // todo: see if we can do without it
  // private get orderBy() {
  //   return this.config.orderBy;
  // }

  private get page() {
    return this.config.page;
  }

  private get environment() {
    return this.config.environment;
  }

  public get store() {
    if (!ImaVidStore.has(this.posterSampleId)) {
      ImaVidStore.set(this.posterSampleId, new ImaVidFrameSamples());
    }

    return ImaVidStore.get(this.posterSampleId);
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
            for (const { cursor, node } of data.samples.edges) {
              if (!node) {
                continue;
              }

              if (node.__typename !== "ImageSample") {
                throw new Error("only image samples supported");
              }

              const nodeSampleId = node.sample["_id"] as string;

              this.store.samples.set(node.sample["_id"], node);
              this.store.frameIndex.set(Number(cursor) + 1, nodeSampleId);
            }
          }
          resolve();
        },
      });
    });
  }

  public isHydrated() {
    return (
      ImaVidStore.has(this.posterSampleId) && this.store.samples.length > 0
    );
  }

  public async hydrateIfEmpty() {
    if (!this.isHydrated()) {
      return this.fetchMore(0);
    }
  }
}
