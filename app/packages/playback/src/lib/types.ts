export type BufferRange = Readonly<[number, number]>;
export type TimelineName = string;
export type FrameNumber = number;
export type TargetFrameRate = number;
export type Speed = number;
export type TotalFrames = number;
export type TimelineSubscribersMap = Map<
  SubscriptionId,
  SequenceTimelineSubscription
>;

// tood: think about making it a symbol and subscribers a WeakMap
export type SubscriptionId = string;

export interface SequenceTimelineSubscription {
  /**
   * Unique identifier for the subscription.
   */
  id: SubscriptionId;

  /**
   * Fetch and prepare a range of frames.
   *
   * Notes:
   * 1. Subscribers should optimistically load their data as much as possible.
   * 2. Subscribers should not block rendering while loading data and display a loading indicator.
   * 3. Subscribers should maintain a buffer of loaded data.
   * 4. Subscribers should not load data that is already in the buffer.
   * 5. This function should be referentially stable.
   *
   * @param range The range of frames to load.
   */
  loadRange: (range: BufferRange) => Promise<void>;

  /**
   * Called when frame number changes.
   *
   * This function should be cheap to call and should not involve any heavy computation
   * or I/O. Use `loadRange` to prepare data.
   *
   * This function should be referentially stable.
   * @param frameNumber The frame number to render.
   */
  renderFrame(frameNumber: number): void;
}

/**
 * Timeline configuration.
 */
export type FoTimelineConfig = {
  /**
   * The default frame number to start the timeline at.
   * This is NOT the current frame number.
   *
   * Frame numbers are 1-indexed.
   *
   * If not provided, the default frame number is 1.
   */
  readonly defaultFrameNumber?: FrameNumber;

  /**
   * Whether the timeline should loop back to the start after reaching the end.
   *
   * Default is false.
   */
  loop?: boolean;

  /**
   * Speed of the timeline.
   *
   * Default is 1.
   */
  speed?: Speed;

  /**
   * Target frames per second rate for when speed is 1.
   *
   * Default is 29.97.
   */
  targetFrameRate?: TargetFrameRate;

  /**
   * Total number of frames in the timeline.
   *
   */
  totalFrames: TotalFrames;

  /**
   * If true, the timeline will show a time indicator instead
   * of the frame number.
   *
   * Default is false.
   */
  useTimeIndicator?: boolean;

  __internal_IsTimelineInitialized?: boolean;
};

export type CreateFoTimeline = {
  /**
   * Name of the timeline.
   */
  name: TimelineName;
  /**
   * Configuration for the timeline.
   */
  config?: FoTimelineConfig;
  /**
   * An optional function that returns a promise that resolves when the timeline is ready to be marked as initialized.
   * If this function is not provided, the timeline is declared to be initialized immediately upon creation.
   */
  waitUntilInitialized?: () => Promise<void>;
  /**
   * If true, the creator will be responsible for managing the animation loop.
   */
  optOutOfAnimation?: boolean;

  /**
   * Callback to be called when the animation stutters.
   */
  onAnimationStutter?: () => void;
};
