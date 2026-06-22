import { fetchSamples, type ModalSample } from "@fiftyone/state";
import { BufferManager } from "@fiftyone/utilities";
import { BufferRange, ImaVidState, StateUpdate } from "../../state";
import { BUFFERS_REFRESH_TIMEOUT_YIELD } from "./constants";
import { ImaVidFrameSamples } from "./ima-vid-frame-samples";

const BUFFER_METADATA_FETCHING = "fetching";

export class ImaVidFramesController {
  private mediaField = "filepath";
  private targetFrameRate: number;
  private timeoutId: number;

  public fetchBufferManager = new BufferManager();
  public isFetching = false;
  public storeBufferManager: BufferManager;
  // undefined until the group's length is known (revealed by a short page or seeded
  // via setTotalFrameCount)
  public totalFrameCount: number | undefined;

  private updateImaVidState: StateUpdate<ImaVidState>;

  // frames keyed by sample `_id` in the shared cache, so grid-hover and modal reuse
  // the same frames; the controller is partitioned by `sampleId-mediaField`
  private frameSamples: ImaVidFrameSamples;

  constructor(
    private readonly config: {
      firstFrameNumber: number;
      targetFrameRate: number;
      datasetId: string;
      // dynamic group-by value identifying this group's ordered frames
      groupValue: string;
      view: unknown;
      filters?: unknown;
      // grid overlay field list (gridSampleFields) the stream projects
      fields: string[];
      // shared sample cache (keyed by `_id`) the grid and modal both use
      sharedSamples: Map<string, ModalSample>;
    }
  ) {
    this.storeBufferManager = new BufferManager([
      [config.firstFrameNumber, config.firstFrameNumber],
    ]);
    this.targetFrameRate = config.targetFrameRate;
    this.frameSamples = new ImaVidFrameSamples(
      this.storeBufferManager,
      config.sharedSamples
    );
  }

  public setImaVidStateUpdater(updater: StateUpdate<ImaVidState>) {
    this.updateImaVidState = updater;
  }

  // seed the group's length from a count the client already has; never overwrites a
  // known count, so a fully-streamed group costs no count queries
  public setTotalFrameCount(count: number) {
    if (count && this.totalFrameCount == null) {
      this.totalFrameCount = count;
      this.updateImaVidState?.({ totalFrames: count });
    }
  }

  public resumeFetch() {
    if (this.isFetching) {
      return;
    }

    this.executeFetch();
  }

  public pauseFetch(updateBuffering = true) {
    window.clearTimeout(this.timeoutId);
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

      // frame range is 1-based; REST `after` is a plain skip so `after = start - 1`
      // returns frame `start` first, count covers the inclusive range
      return this.fetchMore(range[0] - 1, range[1] - range[0] + 1).finally(
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

  public get key() {
    return this.config.groupValue;
  }

  public get store() {
    return this.frameSamples;
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
    // stream the range in chunks: each chunk publishes (fetchMore event) before the
    // next is fetched, so playback starts as soon as the first frames arrive.
    // 100 matches pymongo's default cursor batch
    const CHUNK = 100;

    for (let offset = 0; offset < count; offset += CHUNK) {
      const chunkCursor = cursor + offset;
      const chunkCount = Math.min(CHUNK, count - offset);

      const rows = await fetchSamples({
        datasetId: this.config.datasetId,
        dynamicGroup: this.config.groupValue,
        after: chunkCursor > 0 ? chunkCursor : undefined,
        count: chunkCount,
        // masks fetched inline; decoupling them only helps once the EAV refactor
        // stores masks as standalone blobs fetchable by id
        fields: this.config.fields,
        view: this.config.view,
        filters: this.config.filters,
        // frames inherit the poster's aspect ratio — never open each frame's media
        skipMetadata: true,
      });

      if (rows.length < chunkCount && this.totalFrameCount == null) {
        // a short page ends at the group's last frame, revealing the length
        const revealed = chunkCursor + rows.length;
        if (revealed) {
          this.totalFrameCount = revealed;
          this.updateImaVidState?.({ totalFrames: revealed });
        }
      }

      if (rows.length) {
        const imageFetchPromisesMap = new Map<number, Promise<string>>();
        for (let i = 0; i < rows.length; ++i) {
          const row = rows[i];
          const sampleId = row.id;
          const frameNumber = chunkCursor + i + 1;
          // assemble the runtime frame sample from the field slice; keyed by `_id`
          // in the shared cache → grid/modal reuse
          this.store.samples.set(sampleId, {
            id: sampleId,
            sample: row.fields,
            urls: row.urls,
            image: null,
          } as ModalSample & { image: HTMLImageElement | null });
          imageFetchPromisesMap.set(
            frameNumber,
            this.store.fetchImageForSample(sampleId, row.urls, this.mediaField)
          );
        }

        // mark each frame drawable as soon as its image resolves
        const perFramePromises: Promise<void>[] = [];
        for (const [frameNumber, imagePromise] of imageFetchPromisesMap) {
          perFramePromises.push(
            imagePromise.then((sampleId) => {
              this.store.frameIndex.set(frameNumber, sampleId);
              this.store.reverseFrameIndex.set(sampleId, frameNumber);
            })
          );
        }
        await Promise.all(perFramePromises);

        this.storeBufferManager.addNewRange([
          chunkCursor + 1,
          chunkCursor + rows.length,
        ] as BufferRange);

        // publish this chunk so the looker can play it while the next chunk fetches
        window.dispatchEvent(
          new CustomEvent("fetchMore", {
            detail: { id: this.key },
            bubbles: false,
          })
        );
      }

      // a short page is the group's end — stop streaming further chunks
      if (rows.length < chunkCount) {
        break;
      }
    }
  }

  public destroy() {
    this.pauseFetch();
    this.storeBufferManager.reset();
    this.fetchBufferManager.reset();
  }
}
