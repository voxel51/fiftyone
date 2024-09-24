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
  LOAD_RANGE_SIZE,
} from "./constants";

export type PlayheadState =
  | "playing"
  | "paused"
  | "waitingToPlay"
  | "waitingToPause";

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
  atom<PlayheadState>("paused")
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
    set(_playHeadStates(timelineName), "paused");

    if (timeline.waitUntilInitialized) {
      timeline.waitUntilInitialized().then(() => {
        set(_timelineConfigs(timelineName), {
          ...configWithImputedValues,
          __internal_IsTimelineInitialized: true,
        });
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

    if (!subscribers) {
      set(_frameNumbers(name), newFrameNumber);
      return;
    }

    // verify that the frame number is valid, and is ready to be streamed
    // if not, we need to buffer the data before rendering
    const bufferManager = get(_dataLoadedBuffers(name));

    if (!bufferManager.isValueInBuffer(newFrameNumber)) {
      const { totalFrames } = get(getTimelineConfigAtom(name));
      // need to buffer before rendering
      const rangeLoadPromises: ReturnType<
        SequenceTimelineSubscription["loadRange"]
      >[] = [];
      const newLoadRange = getLoadRangeForFrameNumber(
        newFrameNumber,
        totalFrames
      );
      subscribers.forEach((subscriber) => {
        rangeLoadPromises.push(subscriber.loadRange(newLoadRange));
      });

      set(_currentBufferingRange(name), newLoadRange);

      try {
        await Promise.all(rangeLoadPromises);
        bufferManager.addNewRange(newLoadRange);
      } catch (e) {
        // todo: handle error better
        console.error(e);
      } finally {
        set(_currentBufferingRange(name), [0, 0]);
      }
    }

    const renderPromises: ReturnType<
      SequenceTimelineSubscription["renderFrame"]
    >[] = [];

    // ask all subscribers to render new frame, and the change frame number
    subscribers.forEach((subscriber) => {
      renderPromises.push(subscriber.renderFrame(newFrameNumber));
    });

    Promise.all(renderPromises).then(() => {
      set(_frameNumbers(name), newFrameNumber);
    });
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
const getLoadRangeForFrameNumber = (
  frameNumber: FrameNumber,
  totalFrames: number
) => {
  // frame number cannot be lower than 1
  const min = Math.max(1, frameNumber - LOAD_RANGE_SIZE);
  // frame number cannot be higher than total frames
  const max = Math.min(totalFrames, frameNumber + LOAD_RANGE_SIZE);
  return [min, max] as const;
};
