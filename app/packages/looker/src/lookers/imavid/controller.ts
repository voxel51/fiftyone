import { fetchSamples, type ModalSample } from "@fiftyone/state";
import { BufferManager } from "@fiftyone/utilities";
import { BufferRange, ImaVidState, StateUpdate } from "../../state";
import {
  BUFFERS_REFRESH_TIMEOUT_YIELD,
  INITIAL_LOOK_AHEAD_FRAMES,
  STREAM_BATCH_FRAMES,
} from "./constants";
import { ImaVidFrameSamples } from "./ima-vid-frame-samples";

export class ImaVidFramesController {
  private mediaField = "filepath";
  private targetFrameRate: number;
  private timeoutId: number;

  public fetchBufferManager = new BufferManager();
  // every window POSTed to /samples in this controller's lifetime; a covered
  // window is never re-POSTed — rows persist in the shared sample store, frames
  // whose image load was aborted are re-fetched image-only, and only frames
  // whose rows were evicted (or whose POST failed) are made re-POSTable
  private requestedBufferManager = new BufferManager();
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
      // playback renders only media + overlays; stream just these paths
      fields?: string[];
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
    (window as { __foImavidDebug?: boolean }).__foImavidDebug &&
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
      // drain the queue up front; ranges enqueued mid-pass run on the next tick
      const queued = this.fetchBufferManager.buffers.filter(Boolean);
      this.fetchBufferManager.reset();

      if (queued.length === 0) {
        this.pauseFetch();
        return;
      }

      this.isFetching = true;

      // partition each queued window frame-by-frame: drawable frames are done,
      // never-requested frames are POSTed, requested frames missing only their
      // image (load aborted mid-flight) are refilled image-only from the stored
      // row, and requested frames whose rows were evicted are made re-POSTable.
      // multiple enqueuers (grid look-ahead, modal timeline) overlap freely —
      // no window ever hits the network twice
      const toPost: BufferRange[] = [];
      const imageRefills: number[] = [];
      for (const range of queued) {
        let runStart: number | null = null;
        for (let frame = range[0]; frame <= range[1] + 1; ++frame) {
          let post = false;
          if (frame <= range[1]) {
            if (this.storeBufferManager.isValueInBuffer(frame)) {
              post = false;
            } else if (this.requestedBufferManager.isValueInBuffer(frame)) {
              const sampleId = this.store.frameIndex.get(frame);
              const sample = sampleId
                ? this.store.samples.get(sampleId)
                : undefined;
              if (sample) {
                if (!sample.image) {
                  imageRefills.push(frame);
                } else {
                  // drawable but unregistered (e.g. adopted image) — self-heal
                  this.storeBufferManager.addNewRange([frame, frame]);
                }
              } else {
                this.requestedBufferManager.removeBufferValue(frame);
                post = true;
              }
            } else {
              post = true;
            }
          }
          if (post && runStart === null) {
            runStart = frame;
          } else if (!post && runStart !== null) {
            toPost.push([runStart, frame - 1]);
            runStart = null;
          }
        }
      }

      if (toPost.length === 0 && imageRefills.length === 0) {
        this.pauseFetch();
        return;
      }

      this.updateImaVidState({ buffering: true });

      const work: Promise<unknown>[] = toPost.map((range) => {
        this.requestedBufferManager.addNewRange(range);
        // frame range is 1-based; REST `after` is a skip, so `after = start - 1` returns frame `start` first
        return this.fetchMore(range[0] - 1, range[1] - range[0] + 1).catch(
          (reason) => {
            console.error(`couldn't fetch buffer range ${range}: ${reason}`);
            // a failed window becomes re-POSTable at the next look-ahead's
            // cadence — never a tight 0ms retry loop that storms the backend
            for (let frame = range[0]; frame <= range[1]; ++frame) {
              this.requestedBufferManager.removeBufferValue(frame);
            }
          },
        );
      });
      if (imageRefills.length) {
        work.push(this.refillImages(imageRefills));
      }
      await Promise.allSettled(work);

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

  /** Re-fetch ONLY the images for frames whose rows are already stored. */
  private async refillImages(frameNumbers: number[]) {
    await Promise.allSettled(
      frameNumbers.map((frameNumber) => {
        const sampleId = this.store.frameIndex.get(frameNumber);
        const sample = sampleId ? this.store.samples.get(sampleId) : undefined;
        if (!sampleId || !sample) {
          return Promise.resolve();
        }
        return this.store
          .fetchImageForSample(sampleId, sample.urls, this.mediaField)
          .then(() => {
            if (this.store.samples.get(sampleId)?.image) {
              this.storeBufferManager.addNewRange([frameNumber, frameNumber]);
            }
          });
      }),
    );
    window.dispatchEvent(
      new CustomEvent("fetchMore", {
        detail: { id: this.key },
        bubbles: false,
      }),
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

      (window as { __foImavidDebug?: boolean }).__foImavidDebug &&
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
        fields: this.config.fields,
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
          // index at row time so a frame whose image load aborts can be
          // refilled image-only (drawability stays gated on the image via
          // storeBufferManager)
          this.store.frameIndex.set(frameNumber, sampleId);
          this.store.reverseFrameIndex.set(sampleId, frameNumber);
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
              if (!this.store.samples.get(sampleId)?.image) {
                // evicted, or its image load was aborted mid-flight (detach);
                // left unbuffered so a later pass refills the image (never a
                // re-POST) instead of indexing a hole the playhead can't draw
                return;
              }
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
    this.requestedBufferManager.reset();
  }
}
