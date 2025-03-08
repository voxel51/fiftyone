import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { LRUCache } from "lru-cache";
import { BufferManager, BufferRange } from "../../../utilities/src";
import {
  ATOM_FAMILY_CONFIGS_LRU_CACHE_SIZE,
  DEFAULT_FRAME_NUMBER,
  DEFAULT_LOOP,
  DEFAULT_SPEED,
  DEFAULT_TARGET_FRAME_RATE,
  DEFAULT_USE_TIME_INDICATOR,
  MIN_LOAD_RANGE_SIZE,
  PLAYHEAD_STATE_PAUSED,
  PlayheadState,
} from "./constants";

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

const _frameNumbers = atomFamily((_timelineName: TimelineName) =>
  atom<FrameNumber>(DEFAULT_FRAME_NUMBER)
);

const _currentBufferingRange = atomFamily((_timelineName: TimelineName) =>
  atom<BufferRange>([0, 0])
);

const _dataLoadedBuffers = atomFamily((_timelineName: TimelineName) =>
  atom<BufferManager>(new BufferManager())
);

const _subscribers = atomFamily((_timelineName: TimelineName) =>
  atom<TimelineSubscribersMap>(new Map())
);

const _timelineConfigs = atomFamily((_timelineName: TimelineName) =>
  atom<FoTimelineConfig>({
    totalFrames: 0,
  })
);

const _playHeadStates = atomFamily((_timelineName: TimelineName) =>
  atom<PlayheadState>(PLAYHEAD_STATE_PAUSED)
);

// persist timline configs using LRU cache to prevent memory leaks
export const _INTERNAL_timelineConfigsLruCache = new LRUCache({
  max: ATOM_FAMILY_CONFIGS_LRU_CACHE_SIZE,
  dispose: (timelineName: string) => {
    // remove param from all "families"
    // make sure this is done for all atom families
    _dataLoadedBuffers.remove(timelineName);
    _frameNumbers.remove(timelineName);
    _playHeadStates.remove(timelineName);
    _subscribers.remove(timelineName);
    _timelineConfigs.remove(timelineName);

    getFrameNumberAtom.remove(timelineName);
    getPlayheadStateAtom.remove(timelineName);
    getTimelineConfigAtom.remove(timelineName);
    getTimelineUpdateFreqAtom.remove(timelineName);
  },
});

/**
 * MUTATORS
 */

export const addTimelineAtom = atom(
  null,
  (get, set, timeline: CreateFoTimeline) => {
    // null config means skip timeline creation
    if (!timeline.config) {
      return;
    }

    const timelineName = timeline.name;

    const configWithImputedValues: Omit<
      Required<FoTimelineConfig>,
      "__internal_IsTimelineInitialized"
    > = {
      totalFrames: timeline.config.totalFrames,

      defaultFrameNumber: Math.max(
        timeline.config.defaultFrameNumber ?? DEFAULT_FRAME_NUMBER,
        DEFAULT_FRAME_NUMBER
      ),
      loop: timeline.config.loop ?? DEFAULT_LOOP,
      speed: timeline.config.speed ?? DEFAULT_SPEED,
      targetFrameRate:
        timeline.config.targetFrameRate ?? DEFAULT_TARGET_FRAME_RATE,
      useTimeIndicator:
        timeline.config.useTimeIndicator ?? DEFAULT_USE_TIME_INDICATOR,
    };

    const isTimelineAlreadyInitialized = get(
      _timelineConfigs(timelineName)
    ).__internal_IsTimelineInitialized;

    if (isTimelineAlreadyInitialized) {
      // update config and return
      set(_timelineConfigs(timelineName), {
        ...configWithImputedValues,
        __internal_IsTimelineInitialized: true,
      });
      return;
    }

    if (
      configWithImputedValues.defaultFrameNumber >
      configWithImputedValues.totalFrames
    ) {
      throw new Error(
        `Default frame number ${configWithImputedValues.defaultFrameNumber} is greater than total frames ${configWithImputedValues.totalFrames}`
      );
    }

    set(
      _frameNumbers(timelineName),
      timeline.config.defaultFrameNumber ?? DEFAULT_FRAME_NUMBER
    );
    set(_subscribers(timelineName), new Map());
    set(_timelineConfigs(timelineName), configWithImputedValues);
    set(_dataLoadedBuffers(timelineName), new BufferManager());
    set(_playHeadStates(timelineName), PLAYHEAD_STATE_PAUSED);

    if (timeline.waitUntilInitialized) {
      timeline
        .waitUntilInitialized()
        .then(() => {
          set(_timelineConfigs(timelineName), {
            ...configWithImputedValues,
            __internal_IsTimelineInitialized: true,
          });
        })
        .catch((error) => {
          console.error(
            `Failed to initialize timeline "${timelineName}":`,
            error
          );
        });
    } else {
      // mark timeline as initialized
      set(_timelineConfigs(timelineName), {
        ...configWithImputedValues,
        __internal_IsTimelineInitialized: true,
      });
    }

    // 'true' is a placeholder value, since we're just using the cache for disposing
    _INTERNAL_timelineConfigsLruCache.set(timelineName, timelineName);
  }
);

export const addSubscriberAtom = atom(
  null,
  (
    get,
    set,
    {
      name,
      subscription,
    }: { name: TimelineName; subscription: SequenceTimelineSubscription }
  ) => {
    // warn if subscription with this id already exists
    if (get(_subscribers(name)).has(subscription.id)) {
      console.warn(
        `Subscription with ${subscription.id} already exists for timeline ${name}. Replacing old subscription. Make sure this is an intentional behavior.`
      );
    }

    const bufferManager = get(_dataLoadedBuffers(name));

    set(_subscribers(name), (prev) => {
      prev.set(subscription.id, subscription);
      bufferManager.reset();
      return prev;
    });
  }
);

export const setFrameNumberAtom = atom(
  null,
  async (
    get,
    set,
    {
      name,
      newFrameNumber,
    }: {
      name: TimelineName;
      newFrameNumber: FrameNumber;
    }
  ) => {
    const subscribers = get(_subscribers(name));

    if (!subscribers || subscribers.size === 0) {
      set(_frameNumbers(name), newFrameNumber);
      return;
    }

    // verify that the frame number is valid, and is ready to be streamed
    // if not, we need to buffer the data before rendering
    const bufferManager = get(_dataLoadedBuffers(name));
    const config = get(getTimelineConfigAtom(name));

    const newLoadRange = getLoadRangeForFrameNumber(newFrameNumber, config);

    const isCurrentValueNotInBuffer =
      !bufferManager.isValueInBuffer(newFrameNumber);

    if (!bufferManager.containsRange(newLoadRange)) {
      const rangeLoadPromises: ReturnType<
        SequenceTimelineSubscription["loadRange"]
      >[] = [];
      subscribers.forEach((subscriber) => {
        rangeLoadPromises.push(subscriber.loadRange(newLoadRange));
      });

      set(_currentBufferingRange(name), newLoadRange);

      const allPromisesSettled = Promise.allSettled(rangeLoadPromises);
      // we await only if isCurrentValueNotInBuffer
      // otherwise we can render the frame immediately
      // and load range in background
      if (isCurrentValueNotInBuffer) {
        try {
          await allPromisesSettled;
          bufferManager.addNewRange(newLoadRange);
        } catch (e) {
          // todo: handle error better, maybe retry
          console.error(e);
        } finally {
          set(_currentBufferingRange(name), [0, 0]);
        }
      } else {
        allPromisesSettled.then(() => {
          bufferManager.addNewRange(newLoadRange);
          set(_currentBufferingRange(name), [0, 0]);
        });
      }
    }

    const renderPromises: ReturnType<
      SequenceTimelineSubscription["renderFrame"]
    >[] = [];

    // ask all subscribers to render new frame, and the change frame number
    subscribers.forEach((subscriber) => {
      renderPromises.push(subscriber.renderFrame(newFrameNumber));
    });

    await Promise.allSettled(renderPromises);
    set(_frameNumbers(name), newFrameNumber);
  }
);

export const updateTimelineConfigAtom = atom(
  null,
  (
    get,
    set,
    {
      name,
      configDelta,
    }: {
      name: TimelineName;
      configDelta: Partial<
        Omit<FoTimelineConfig, "totalFrames" | "defaultFrameNumber">
      >;
    }
  ) => {
    const oldConfig = get(_timelineConfigs(name));
    set(_timelineConfigs(name), { ...oldConfig, ...configDelta });
  }
);

export const updatePlayheadStateAtom = atom(
  null,
  (
    _get,
    set,
    { name, state }: { name: TimelineName; state: PlayheadState }
  ) => {
    set(_playHeadStates(name), state);
  }
);

/**
 * GETTERS
 *
 * note: no need to set getters for timeline config, or subscribers
 * as they are not used directly.
 */

export const getDataLoadedBuffersAtom = atomFamily(
  (_timelineName: TimelineName) =>
    atom((get) => get(_dataLoadedBuffers(_timelineName)))
);

export const getCurrentBufferingRangeAtom = atomFamily(
  (_timelineName: TimelineName) =>
    atom((get) => get(_currentBufferingRange(_timelineName)))
);

export const getFrameNumberAtom = atomFamily((_timelineName: TimelineName) =>
  atom((get) => {
    return get(_frameNumbers(_timelineName));
  })
);

export const getPlayheadStateAtom = atomFamily((_timelineName: TimelineName) =>
  atom((get) => get(_playHeadStates(_timelineName)))
);

export const getIsTimelineInitializedAtom = atomFamily(
  (_timelineName: TimelineName) =>
    atom((get) => {
      return Boolean(
        get(_timelineConfigs(_timelineName)).__internal_IsTimelineInitialized
      );
    })
);

export const getTimelineConfigAtom = atomFamily((_timelineName: TimelineName) =>
  atom((get) => get(_timelineConfigs(_timelineName)))
);

export const getTimelineUpdateFreqAtom = atomFamily(
  (_timelineName: TimelineName) =>
    atom((get) => {
      const config = get(getTimelineConfigAtom(_timelineName));
      const targetFrameRate =
        config.targetFrameRate ?? DEFAULT_TARGET_FRAME_RATE;
      const speed = config.speed ?? 1;
      return 1000 / (targetFrameRate * speed);
    })
);

/**
 * UTILS
 */
export const getLoadRangeForFrameNumber = (
  frameNumber: FrameNumber,
  config: FoTimelineConfig
): BufferRange => {
  const { totalFrames, targetFrameRate, speed } = config;

  // we'll keep behind-buffer size fixed
  const behindBuffer = MIN_LOAD_RANGE_SIZE;
  // adaptive ahead-buffer: at minimum MIN_LOAD_RANGE_SIZE,
  // but scales with speed and target frame rate relative to a baseline

  const baseAdaptiveBuffer =
    MIN_LOAD_RANGE_SIZE *
    (speed ?? 1) *
    ((targetFrameRate ?? DEFAULT_TARGET_FRAME_RATE) /
      DEFAULT_TARGET_FRAME_RATE);

  // use weight = 2% of totalFrames to gently extend the buffer on larger timelines.
  const totalFramesFactor = Math.ceil(totalFrames * 0.02);

  const adaptiveAheadBuffer = Math.max(
    MIN_LOAD_RANGE_SIZE,
    Math.ceil(baseAdaptiveBuffer + totalFramesFactor)
  );

  // initial range centered on the current frame.
  let min = frameNumber - behindBuffer;
  let max = frameNumber + adaptiveAheadBuffer;

  // if the range exceeds totalFrames at the end,
  // pull extra frames from behind to maintain overall buffer size.
  if (max > totalFrames) {
    const extra = max - totalFrames;
    min = Math.max(1, min - extra);
    max = totalFrames;
  }
  // similarly, if the range goes below 1, extend the ahead buffer.
  if (min < 1) {
    const extra = 1 - min;
    max = Math.min(totalFrames, max + extra);
    min = 1;
  }

  return [min, max] as const;
};
