import type {
  BufferReadiness,
  PlaybackStream,
} from "../../../../lib/playback/types";

const IDLE_MIN_MS = 4000;
const IDLE_MAX_MS = 10000;
const BLOCK_MIN_MS = 3000;
const BLOCK_MAX_MS = 5000;

const randomBetween = (lo: number, hi: number) =>
  lo + Math.random() * (hi - lo);

/**
 * A demo `PlaybackStream` that randomly toggles between "ready" and
 * "loading" on a timer to simulate a flaky data source. While it's in the
 * loading state it stalls the whole engine — every other blocking stream
 * (and the visual playhead) waits for it to come back. Use this to
 * demonstrate that one stalled stream affects the entire timeline.
 *
 * The stream's `buffering` state is mirrored to a React component through
 * the `onChange` callback so the tile UI can render a spinner / status
 * label. Call `destroy()` when the stream is unregistered so the timer
 * stops firing.
 */
export class RandomBlockingStream implements PlaybackStream {
  readonly id: string;
  readonly blocking = true;
  readonly duration: number;

  private buffering = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private readonly onChange: (buffering: boolean) => void;

  constructor(
    id: string,
    onChange: (buffering: boolean) => void,
    duration = 20
  ) {
    this.id = id;
    this.onChange = onChange;
    this.duration = duration;
    this.scheduleIdle();
  }

  bufferState(): BufferReadiness {
    return this.buffering ? "loading" : "ready";
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleIdle(): void {
    if (this.destroyed) return;
    this.timer = setTimeout(() => {
      this.beginBlocking();
    }, randomBetween(IDLE_MIN_MS, IDLE_MAX_MS));
  }

  private beginBlocking(): void {
    if (this.destroyed) return;
    this.buffering = true;
    this.onChange(true);
    this.timer = setTimeout(() => {
      this.endBlocking();
    }, randomBetween(BLOCK_MIN_MS, BLOCK_MAX_MS));
  }

  private endBlocking(): void {
    if (this.destroyed) return;
    this.buffering = false;
    this.onChange(false);
    this.scheduleIdle();
  }
}
