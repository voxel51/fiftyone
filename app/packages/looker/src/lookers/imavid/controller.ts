import * as foq from "@fiftyone/relay";
import { Environment, Subscription, fetchQuery } from "relay-runtime";
import { Sample } from "../..";
import { DEFAULT_FRAME_RATE, LOOK_AHEAD_TIME_SECONDS } from "./constants";
import { ImaVidFrameSamples } from "./ima-vid-frame-samples";
import { ImaVidStore } from "./store";

export class ImaVidFramesController {
  private subscription: Subscription;
  private frameRate = DEFAULT_FRAME_RATE;

  constructor(
    private readonly config: {
      environment: Environment;
      // todo: see if we can do without it
      orderBy: string;
      // todo: remove any
      page: any;
      posterSample: Sample;
      totalFrameCount: number;
    }
  ) {}

  public get currentFrameRate() {
    return this.frameRate;
  }

  private get environment() {
    return this.config.environment;
  }

  private get page() {
    return this.config.page;
  }

  private get posterSampleId() {
    return this.config.posterSample._id;
  }

  public get store() {
    if (!ImaVidStore.has(this.posterSampleId)) {
      ImaVidStore.set(this.posterSampleId, new ImaVidFrameSamples());
    }

    return ImaVidStore.get(this.posterSampleId);
  }

  public get totalFrameCount() {
    return this.config.totalFrameCount;
  }

  public cleanup() {
    try {
      this.subscription?.unsubscribe();
    } catch {}
  }

  public setFrameRate(newFrameRate: number) {
    if (newFrameRate > 24) {
      throw new Error("max frame rate is 24");
    }

    if (newFrameRate < 1) {
      throw new Error("min frame rate is 1");
    }

    this.frameRate = newFrameRate;
  }

  public getFrameFetchBatchSize() {
    return LOOK_AHEAD_TIME_SECONDS * this.frameRate;
  }

  public async fetchMore(cursor: number) {
    const variables = this.page(cursor, this.getFrameFetchBatchSize());

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
