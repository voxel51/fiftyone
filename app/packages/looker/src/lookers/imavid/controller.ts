import * as foq from "@fiftyone/relay";
import { BufferManager } from "@fiftyone/utilities";
import { Environment, Subscription, fetchQuery } from "relay-runtime";
import { BufferRange, ImaVidState, StateUpdate } from "../../state";
import { BUFFERS_REFRESH_TIMEOUT_YIELD } from "./constants";
import {
  ImaVidFrameSamples,
  ModalSampleExtendedWithImage,
} from "./ima-vid-frame-samples";
import { ImaVidStore } from "./store";

const BUFFER_METADATA_FETCHING = "fetching";

export class ImaVidFramesController {
  private mediaField = "filepath";
  private subscription: Subscription;
  private targetFrameRate: number;
  private timeoutId: number;

  public fetchBufferManager = new BufferManager();
  public isFetching = false;
  public storeBufferManager: BufferManager;
  public totalFrameCount: number;

  private updateImaVidState: StateUpdate<ImaVidState>;

  constructor(
    private readonly config: {
      environment: Environment;
      firstFrameNumber: number;
      // todo: remove any
      page: any;
      key: string;
      totalFrameCountPromise: Promise<number>;
      targetFrameRate: number;
    }
  ) {
    this.storeBufferManager = new BufferManager([
      [config.firstFrameNumber, config.firstFrameNumber],
    ]);
    config.totalFrameCountPromise.then((frameCount) => {
      this.totalFrameCount = frameCount;
    });
    this.targetFrameRate = config.targetFrameRate;
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

      // subtract/add by two because 1) cursor is one based and 2) cursor here translates to "after" the cursor
      return this.fetchMore(range[0] - 2, range[1] - range[0] + 2).finally(
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
    return this.targetFrameRate;
  }

  public get isStoreBufferManagerEmpty() {
    return this.storeBufferManager.totalFramesInBuffer === 0;
  }

  private get environment() {
    return this.config.environment;
  }

  private get page() {
    return this.config.page;
  }

  public get key() {
    return this.config.key;
  }

  public get store() {
    if (!ImaVidStore.has(this.key)) {
      ImaVidStore.set(
        this.key,
        new ImaVidFrameSamples(this.storeBufferManager)
      );
    }

    return ImaVidStore.get(this.key);
  }

  public setFrameRate(newFrameRate: number) {
    if (newFrameRate > 60) {
      throw new Error("max frame rate is 60");
    }

    if (newFrameRate < 1) {
      throw new Error("min frame rate is 1");
    }

    this.targetFrameRate = newFrameRate;
  }

  public setMediaField(mediaField: string) {
    this.mediaField = mediaField;
  }

  public async fetchMore(cursor: number, count: number) {
    const variables = this.page(cursor, count);

    const fetchUid = `${this.key}-${cursor}-${variables.count}`;

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
            // map of frame index to sample id resolved by image fetching promise
            // (insertion order preserved)
            const imageFetchPromisesMap: Map<
              number,
              Promise<string>
            > = new Map();

            // update store
            for (const { cursor, node } of data.samples.edges) {
              if (!node) {
                continue;
              }

              const sample = {
                ...node,
                image: null,
              } as ModalSampleExtendedWithImage;
              const sampleId = sample.sample["_id"] as string;

              if (sample.__typename !== "ImageSample") {
                throw new Error("only image samples supported");
              }

              // offset by one because cursor is zero based and frame index is one based
              const frameIndex = Number(cursor) + 1;

              this.store.samples.set(sampleId, sample);

              imageFetchPromisesMap.set(
                frameIndex,
                this.store.fetchImageForSample(
                  sampleId,
                  sample["urls"],
                  this.mediaField
                )
              );
            }

            const frameIndices = imageFetchPromisesMap.keys();
            const imageFetchPromises = imageFetchPromisesMap.values();

            Promise.all(imageFetchPromises)
              .then((sampleIds) => {
                for (let i = 0; i < sampleIds.length; i++) {
                  const frameIndex = frameIndices.next().value;
                  const sampleId = sampleIds[i];
                  this.store.frameIndex.set(frameIndex, sampleId);
                  this.store.reverseFrameIndex.set(sampleId, frameIndex);
                }
                resolve();
              })
              .then(() => {
                const newRange = [
                  Number(data.samples.edges[0].cursor) + 1,
                  Number(
                    data.samples.edges[data.samples.edges.length - 1].cursor
                  ) + 1,
                ] as BufferRange;

                this.storeBufferManager.addNewRange(newRange);

                window.dispatchEvent(
                  new CustomEvent("fetchMore", {
                    detail: {
                      id: this.key,
                    },
                    bubbles: false,
                  })
                );
              });
          }
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
