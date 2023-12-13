import * as foq from "@fiftyone/relay";
import { Environment, Subscription, fetchQuery } from "relay-runtime";
import { Sample } from "../..";
import { BufferRange, ImaVidState, StateUpdate } from "../../state";
import { BufferManager } from "./buffer-manager";
import { BUFFERS_REFRESH_TIMEOUT_YIELD, DEFAULT_FRAME_RATE } from "./constants";
import { ImaVidFrameSamples } from "./ima-vid-frame-samples";
import { ImaVidStore } from "./store";

const BUFFER_METADATA_FETCHING = "fetching";

export class ImaVidFramesController {
  public fetchBufferManager = new BufferManager();
  private frameRate = DEFAULT_FRAME_RATE;

  public totalFrameCount: number;
  private timeoutId: number;
  public isFetching = false;
  public storeBufferManager: BufferManager;
  private subscription: Subscription;
  private updateImaVidState: StateUpdate<ImaVidState>;

  constructor(
    private readonly config: {
      environment: Environment;
      firstFrameNumber: number;
      // todo: see if we can do without it
      orderBy: string;
      // todo: remove any
      page: any;
      posterSample: Sample;
      totalFrameCountPromise: Promise<number>;
    }
  ) {
    this.storeBufferManager = new BufferManager([
      [config.firstFrameNumber, config.firstFrameNumber],
    ]);
    config.totalFrameCountPromise.then((frameCount) => {
      this.totalFrameCount = frameCount;
    });
  }

  public setImaVidStateUpdater(updater: StateUpdate<ImaVidState>) {
    this.updateImaVidState = updater;
  }

  public resumeFetch() {
    if (this.isFetching) {
      return;
    }

    this.executeFetch();
  }

  public pauseFetch(updateBuffering = true) {
    window.clearTimeout(this.timeoutId);
    this.subscription?.unsubscribe();
    this.fetchBufferManager.reset();
    this.isFetching = false;
    if (updateBuffering) {
      this.updateImaVidState(({ buffering }) => {
        if (buffering) {
          return { buffering: false };
        }
        return {};
      });
    }
  }

  public enqueueFetch(frameRange: Readonly<BufferRange>) {
    this.fetchBufferManager.addNewRange(frameRange);
  }

  private async executeFetch() {
    let totalUnfetchedRanges = 0;
    let totalFetchingRanges = 0;
    const unfetchedRanges = [];

    const fetchingRanges = []; // remove

    for (let i = 0; i < this.fetchBufferManager.buffers.length; ++i) {
      const range = this.fetchBufferManager.buffers[i];

      if (!range) {
        continue;
      }

      if (
        this.fetchBufferManager.getMetadataForBufferRange(i) ===
        BUFFER_METADATA_FETCHING
      ) {
        totalFetchingRanges += 1;
        fetchingRanges.push(range); // remove
      } else {
        totalUnfetchedRanges += 1;
        unfetchedRanges.push(range);
      }
    }

    // end recursion condition
    if (totalUnfetchedRanges === 0 && totalFetchingRanges === 0) {
      this.pauseFetch();
      return;
    }

    this.isFetching = true;

    if (totalFetchingRanges > 0 && totalUnfetchedRanges === 0) {
      this.timeoutId = window.setTimeout(
        this.executeFetch.bind(this),
        BUFFERS_REFRESH_TIMEOUT_YIELD
      );
      return;
    }

    this.updateImaVidState({ buffering: true });

    const fetchPromises = unfetchedRanges.map((range, index) => {
      this.fetchBufferManager.addMetadataToBufferRange(
        index,
        BUFFER_METADATA_FETCHING
      );

      // subtract by two because 1) cursor is one based and 2) cursor here translates to "after" the cursor
      return this.fetchMore(range[0] - 2, range[1] - range[0] || 1).finally(
        () => {
          this.fetchBufferManager.removeMetadataFromBufferRange(index);
        }
      );
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

    this.timeoutId = window.setTimeout(
      this.executeFetch.bind(this),
      BUFFERS_REFRESH_TIMEOUT_YIELD
    );
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
      ImaVidStore.set(
        this.posterSampleId,
        new ImaVidFrameSamples(this.storeBufferManager)
      );
    }

    return ImaVidStore.get(this.posterSampleId);
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

  public async fetchMore(cursor: number, count: number) {
    const variables = this.page(cursor, count);

    const fetchUid = `${this.posterSampleId}-${cursor}-${variables.count}`;

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
              this.store.reverseFrameIndex.set(
                nodeSampleId,
                Number(cursor) + 1
              );
            }

            this.storeBufferManager.addNewRange([
              Number(data.samples.edges[0].cursor) + 1,
              Number(data.samples.edges[data.samples.edges.length - 1].cursor) +
                1,
            ]);
          }
          resolve();
        },
      });
      // todo: see if environment.retain() is applicable here,
      // since fetchQuery() doesn't retain data after request completes
      // reference: https://relay.dev/docs/api-reference/fetch-query/
    });
  }

  public destroy() {
    this.pauseFetch();
    this.storeBufferManager.reset();
    this.fetchBufferManager.reset();
  }
}
