import * as foq from "@fiftyone/relay";
import { Environment, Subscription, fetchQuery } from "relay-runtime";
import { Sample } from "../..";
import { BufferRange } from "../../state";
import { BufferManager } from "./buffer-manager";
import {
  BUFFERS_REFRESH_INTERVAL,
  DEFAULT_FRAME_RATE,
  LOOK_AHEAD_TIME_SECONDS as DEFAULT_LOOK_AHEAD_TIME_SECONDS,
} from "./constants";
import { ImaVidFrameSamples } from "./ima-vid-frame-samples";
import { ImaVidStore } from "./store";

export class ImaVidFramesController {
  public storeBufferManager = new BufferManager();
  private fetchBufferManager = new BufferManager();
  private frameRate = DEFAULT_FRAME_RATE;

  public totalFrameCount: number;
  private intervalId: number;
  public isFetching = false;
  private subscription: Subscription;

  constructor(
    private readonly config: {
      environment: Environment;
      // todo: see if we can do without it
      orderBy: string;
      // todo: remove any
      page: any;
      posterSample: Sample;
      totalFrameCountPromise: Promise<number>;
    }
  ) {
    config.totalFrameCountPromise.then((frameCount) => {
      this.totalFrameCount = frameCount;
    });
  }

  public resumeFetch() {
    if (this.isFetching) {
      return;
    }

    this.intervalId = window.setInterval(
      this.executeFetch.bind(this),
      BUFFERS_REFRESH_INTERVAL
    );

    this.isFetching = true;
  }

  public pauseFetch() {
    window.clearInterval(this.intervalId);
    this.isFetching = false;
  }

  private async executeFetch() {
    if (this.fetchBufferManager.buffers.length === 0) {
      this.isFetching = false;
      return;
    }

    const fetchPromises = this.fetchBufferManager.buffers.map((range) => {
      return this.fetchMore(range[0], range[1] - range[0]);
    });

    const results = await Promise.allSettled(fetchPromises);
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `couldn't fetch buffer range ${this.fetchBufferManager.buffers[index]}: ${result.reason}`
        );
      } else {
        this.fetchBufferManager.removeRangeAtIndex(index);
      }
    });
  }

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

  public cleanup() {
    try {
      this.subscription?.unsubscribe();
    } catch {}

    this.pauseFetch();
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

  public enqueueFetch(frameRange: Readonly<BufferRange>) {
    this.fetchBufferManager.addNewRange(frameRange);
  }

  public async fetchMore(cursor: number, count?: number) {
    const variables = this.page(
      cursor,
      count ?? DEFAULT_LOOK_AHEAD_TIME_SECONDS * this.frameRate
    );

    const fetchUid = `${this.posterSampleId}-${variables.cursor}-${variables.count}`;

    console.log(`fetching ${fetchUid}`);

    return new Promise<void>((resolve, _reject) => {
      // do a gql query here, get samples, update store
      this.subscription = fetchQuery<foq.paginateSamplesQuery>(
        this.environment,
        foq.paginateSamples,
        variables,
        {
          fetchPolicy: "store-or-network",
          networkCacheConfig: {
            transactionId: fetchUid,
          },
        }
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

            this.storeBufferManager.addNewRange([
              Number(data.samples.edges[0].cursor),
              Number(data.samples.edges[data.samples.edges.length - 1].cursor),
            ]);
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
