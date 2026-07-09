import { fetchSamples, type ModalSample } from "@fiftyone/state";
import { BufferManager } from "@fiftyone/utilities";
import { BufferRange, ImaVidState, StateUpdate } from "../../state";
import {
  BUFFERS_REFRESH_TIMEOUT_YIELD,
  INITIAL_LOOK_AHEAD_FRAMES,
  STREAM_BATCH_FRAMES,
} from "./constants";
import { ImaVidFrameSamples } from "./ima-vid-frame-samples";

const BUFFER_METADATA_FETCHING = "fetching";

export class ImaVidFramesController {
  private mediaField = "filepath";
  private targetFrameRate: number;
  private timeoutId: number;

  public fetchBufferManager = new BufferManager();
  public isFetching = false;
  // synchronous re-entrancy guard: executeFetch's render synchronously calls back into resumeFetch, which would recurse to a stack overflow
  private executing = false;
  public storeBufferManager: BufferManager;
  // undefined until the group's length is known, revealed by the stream or seeded via setTotalFrameCount
  public totalFrameCount: number | undefined;

  private updateImaVidState: StateUpdate<ImaVidState>;

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
      // group slice filter (e.g. {group: {slice}}) scoping a nested dynamic
      // group's frame stream to one slice
      filter?: unknown;
    },
  ) {
    this.storeBufferManager = new BufferManager([
      [config.firstFrameNumber, config.firstFrameNumber],
    ]);
    this.targetFrameRate = config.targetFrameRate;
    this.frameSamples = new ImaVidFrameSamples(this.storeBufferManager);
  }

  public setImaVidStateUpdater(updater: StateUpdate<ImaVidState>) {
    this.updateImaVidState = updater;
  }

  // seed the group's length from a count the client already has; never overwrites a known count
  public setTotalFrameCount(count: number) {
    const accepted = Boolean(count && this.totalFrameCount == null);
    console.debug(
      "[imavid] setTotalFrameCount",
      {
        group: this.key,
        offered: count,
        current: this.totalFrameCount,
        accepted,
      },
      new Error("call site").stack,
    );
    if (accepted) {
      this.totalFrameCount = count;
      this.updateImaVidState?.({ totalFrames: count });
    }
  }

  public resumeFetch() {
    // a running pass schedules its own continuation, so only start when idle; below we preempt the pending poll timer to pick up the new range now
    if (this.executing) {
      return;
    }

    window.clearTimeout(this.timeoutId);
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
    // frame numbers are integral; fractional ranges corrupt the frame index
    // (fractional keys never match the integer playhead) and the REST payload
    this.fetchBufferManager.addNewRange([
      Math.floor(frameRange[0]),
      Math.ceil(frameRange[1]),
    ] as BufferRange);
  }

  private async executeFetch() {
    if (this.executing) {
      return;
    }
    this.executing = true;
    try {
      let totalUnfetchedRanges = 0;
      let totalFetchingRanges = 0;
      const unfetchedRanges = [];

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
        } else {
          totalUnfetchedRanges += 1;
          unfetchedRanges.push(range);
        }
      }

      if (totalUnfetchedRanges === 0 && totalFetchingRanges === 0) {
        this.pauseFetch();
        return;
      }

      this.isFetching = true;

      if (totalFetchingRanges > 0 && totalUnfetchedRanges === 0) {
        this.timeoutId = window.setTimeout(
          this.executeFetch.bind(this),
          BUFFERS_REFRESH_TIMEOUT_YIELD,
        );
        return;
      }

      this.updateImaVidState({ buffering: true });

      const fetchPromises = unfetchedRanges.map((range) => {
        // index by the range's live position, not the `unfetchedRanges` index —
        // metadata is keyed by `buffers` index and the two differ when any range
        // is already fetching
        this.fetchBufferManager.addMetadataToBufferRange(
          this.fetchBufferManager.buffers.indexOf(range),
          BUFFER_METADATA_FETCHING,
        );

        // frame range is 1-based; REST `after` is a skip, so `after = start - 1` returns frame `start` first
        return this.fetchMore(range[0] - 1, range[1] - range[0] + 1).finally(
          () => {
            this.fetchBufferManager.removeMetadataFromBufferRange(
              this.fetchBufferManager.buffers.indexOf(range),
            );
          },
        );
      });

      const results = await Promise.allSettled(fetchPromises);

      results.forEach((result, index) => {
        const range = unfetchedRanges[index];
        if (result.status === "rejected") {
          console.error(
            `couldn't fetch buffer range ${range}: ${result.reason}`,
          );
        }
        // drop the range on success (now cached) AND on failure (re-enqueued by
        // the next look-ahead at normal cadence, never a tight 0ms retry loop that
        // storms the backend during an outage). remove by live index so splices
        // don't shift the wrong entries out.
        const at = this.fetchBufferManager.buffers.indexOf(range);
        if (at !== -1) {
          this.fetchBufferManager.removeRangeAtIndex(at);
        }
      });

      // ranges enqueued during the fetch (e.g. the look-ahead as playback advanced) run on
      // the next tick; only idle-poll once caught up so a depleting buffer never waits long
      const hasPending = this.fetchBufferManager.buffers.some(Boolean);
      this.timeoutId = window.setTimeout(
        this.executeFetch.bind(this),
        hasPending ? 0 : BUFFERS_REFRESH_TIMEOUT_YIELD,
      );
    } finally {
      this.executing = false;
    }
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
    // integral windows only; see enqueueFetch
    cursor = Math.floor(cursor);
    count = Math.ceil(count);
    // stream the range in chunks, publishing each before fetching the next so
    // playback starts as soon as the first frames arrive. The first chunk is
    // deliberately small: fast first paint, while the rest of the range keeps
    // streaming in the same request (no serial second fetch to wait on)
    const pendingImageBatches: Promise<unknown>[] = [];
    let offset = 0;
    while (offset < count) {
      let chunkCount = Math.min(
        offset === 0 ? INITIAL_LOOK_AHEAD_FRAMES : STREAM_BATCH_FRAMES,
        count - offset,
      );
      // absorb a tiny remainder into this chunk instead of a follow-up sliver request
      if (count - offset - chunkCount < 10) {
        chunkCount = count - offset;
      }
      const chunkCursor = cursor + offset;
      offset += chunkCount;

      console.debug("[imavid] fetchMore chunk", {
        group: this.key,
        after: chunkCursor,
        count: chunkCount,
        requestedRange: `[${cursor + 1}, ${cursor + count}]`,
        totalFrameCount: this.totalFrameCount,
      });
      const rows = await fetchSamples({
        datasetId: this.config.datasetId,
        dynamicGroup: this.config.groupValue,
        after: chunkCursor > 0 ? chunkCursor : undefined,
        count: chunkCount,
        view: this.config.view,
        filters: this.config.filters,
        filter: this.config.filter,
        // frames inherit the poster's aspect ratio — never open each frame's media
        skipMetadata: true,
      });

      if (rows.length < chunkCount && this.totalFrameCount == null) {
        // a short page ends at the group's last frame; reveal the length from the stream
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
          this.store.samples.set(sampleId, {
            id: sampleId,
            sample: row.fields,
            urls: row.urls,
            image: null,
          } as unknown as ModalSample & { image: HTMLImageElement | null });
          imageFetchPromisesMap.set(
            frameNumber,
            this.store.fetchImageForSample(sampleId, row.urls, this.mediaField),
          );
        }

        // mark each frame drawable as its image resolves; do NOT await here —
        // the next chunk's POST runs concurrently with this chunk's image
        // downloads, roughly doubling stream throughput
        const perFramePromises: Promise<void>[] = [];
        for (const [frameNumber, imagePromise] of imageFetchPromisesMap) {
          perFramePromises.push(
            imagePromise.then((sampleId) => {
              const sample = this.store.samples.get(sampleId);
              if (!sample?.image) {
                // evicted, or its image load was aborted mid-flight (detach);
                // leave it unbuffered so the look-ahead refetches it instead
                // of indexing a hole the playhead can never draw
                return;
              }
              this.store.frameIndex.set(frameNumber, sampleId);
              this.store.reverseFrameIndex.set(sampleId, frameNumber);
              // buffered the moment THIS frame is drawable — the loader bar and
              // runway math track reality instead of jumping per chunk
              this.storeBufferManager.addNewRange([frameNumber, frameNumber]);
            }),
          );
        }
        pendingImageBatches.push(
          Promise.all(perFramePromises).then(() => {
            // publish this chunk so the looker repaints/resumes from it
            window.dispatchEvent(
              new CustomEvent("fetchMore", {
                detail: { id: this.key },
                bubbles: false,
              }),
            );
          }),
        );
      }

      // a short page is the group's end
      if (rows.length < chunkCount) {
        break;
      }
    }

    // settle before resolving so executeFetch's queue lifecycle stays correct
    await Promise.allSettled(pendingImageBatches);
  }

  /**
   * Detach (tile hidden/recycled by the grid): stop fetching and settle
   * in-flight image loads, but KEEP buffered frames — this controller is
   * shared by grid hover and the modal (keyed by sample `_id`), so re-attach
   * must replay from buffer, never refetch from frame 1.
   */
  public suspend() {
    this.pauseFetch(false);
    this.frameSamples.abortInFlightImages();
    this.fetchBufferManager.reset();
  }

  /** Full teardown (view/filter/dataset change): buffers are re-keyed, drop everything. */
  public destroy() {
    this.pauseFetch();
    // cancel in-flight image downloads (settles their promises); the signal is
    // re-armed, so a revived controller's future fetches are unaffected
    this.frameSamples.abortInFlightImages();
    this.storeBufferManager.reset();
    this.fetchBufferManager.reset();
  }
}
