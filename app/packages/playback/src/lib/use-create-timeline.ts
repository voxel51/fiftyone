import { Optional, useEventHandler, useKeydownHandler } from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  _INTERNAL_timelineConfigsLruCache,
  addSubscriberAtom,
  addTimelineAtom,
  CreateFoTimeline,
  getFrameNumberAtom,
  getPlayheadStateAtom,
  getTimelineConfigAtom,
  getTimelineUpdateFreqAtom,
  SequenceTimelineSubscription,
  setFrameNumberAtom,
  updatePlayheadStateAtom,
} from "../lib/state";
import {
  DEFAULT_FRAME_NUMBER,
  PLAYHEAD_STATE_BUFFERING,
  PLAYHEAD_STATE_PAUSED,
  PLAYHEAD_STATE_PLAYING,
  PLAYHEAD_STATE_WAITING_TO_PAUSE,
} from "./constants";
import { useDefaultTimelineNameImperative } from "./use-default-timeline-name";
import { getTimelineSetFrameNumberEventName } from "./utils";

/**
 * This hook creates a new timeline with the given configuration.
 *
 * @param newTimelineProps - The configuration for the new timeline. `name` is
 * optional and defaults to an internal global timeline ID scoped to the current modal.
 *
 * @returns An object with the following properties:
 * - `isTimelineInitialized`: Whether the timeline has been initialized.
 * - `subscribe`: A function that subscribes to the timeline.
 */
export const useCreateTimeline = (
  newTimelineProps: Optional<CreateFoTimeline, "name">
) => {
  const { getName } = useDefaultTimelineNameImperative();
  const { name: mayBeTimelineName } = newTimelineProps;

  const timelineName = useMemo(
    () => mayBeTimelineName ?? getName(),
    [mayBeTimelineName, getName]
  );

  const { __internal_IsTimelineInitialized: isTimelineInitialized, ...config } =
    useAtomValue(getTimelineConfigAtom(timelineName));

  const frameNumber = useAtomValue(getFrameNumberAtom(timelineName));
  const playHeadState = useAtomValue(getPlayheadStateAtom(timelineName));
  const updateFreq = useAtomValue(getTimelineUpdateFreqAtom(timelineName));

  const addSubscriber = useSetAtom(addSubscriberAtom);
  const addTimeline = useSetAtom(addTimelineAtom);
  const setFrameNumber = useSetAtom(setFrameNumberAtom);
  const setPlayHeadState = useSetAtom(updatePlayheadStateAtom);

  /**
   * this effect syncs onAnimationStutter ref from props
   */
  useEffect(() => {
    onAnimationStutterRef.current = newTimelineProps.onAnimationStutter;
  }, [newTimelineProps.onAnimationStutter]);

  /**
   * this effect creates the timeline
   */
  useEffect(() => {
    // missing config might be used as a technique to delay the initialization of the timeline
    if (!newTimelineProps.config) {
      return;
    }

    addTimeline({ name: timelineName, config: newTimelineProps.config });

    // this is so that this timeline is brought to the front of the cache
    _INTERNAL_timelineConfigsLruCache.get(timelineName);

    return () => {
      // when component using this hook unmounts, pause animation
      pause();
      // timeline cleanup is handled by `_INTERNAL_timelineConfigsLruCache::dispose()`
    };

    // note: we're not using newTimelineConfig.config as a dependency
    // because it's not guaranteed to be referentially stable.
    // that would require caller to memoize the passed config object.
    // instead use constituent properties of the config object that are primitives
    // or referentially stable
  }, [
    addTimeline,
    timelineName,
    newTimelineProps.waitUntilInitialized,
    newTimelineProps.optOutOfAnimation,
    newTimelineProps.config?.loop,
    newTimelineProps.config?.totalFrames,
  ]);

  /**
   * this effect starts or stops the animation
   * based on the playhead state
   */
  useEffect(() => {
    if (!isTimelineInitialized || newTimelineProps.optOutOfAnimation) {
      return;
    }

    if (playHeadState === PLAYHEAD_STATE_PLAYING) {
      startAnimation();
    }

    if (playHeadState === PLAYHEAD_STATE_PAUSED) {
      cancelAnimation();
    }

    playHeadStateRef.current = playHeadState;
  }, [
    isTimelineInitialized,
    playHeadState,
    newTimelineProps.optOutOfAnimation,
  ]);

  /**
   * this effect establishes a binding with externally
   * updated frame number. Note that for this effect to have
   * the required effect, the external setter needs to have disabled animation first
   * by dispatching a pause event
   */
  useEffect(() => {
    if (!isAnimationActiveRef.current) {
      frameNumberRef.current = frameNumber;
    }
  }, [frameNumber]);

  /**
   * the following effects are used to keep the refs up to date
   */
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    updateFreqRef.current = updateFreq;
  }, [updateFreq]);

  const animationId = useRef(-1);
  const configRef = useRef(config);
  const isAnimationActiveRef = useRef(false);
  const isLastDrawFinishedRef = useRef(true);
  const frameNumberRef = useRef(frameNumber);
  const onAnimationStutterRef = useRef(newTimelineProps.onAnimationStutter);
  const onPlayListenerRef = useRef<() => void>();
  const onPauseListenerRef = useRef<() => void>();
  const onSeekCallbackRefs = useRef<{ start: () => void; end: () => void }>();
  const lastDrawTime = useRef(-1);
  const playHeadStateRef = useRef(playHeadState);
  const updateFreqRef = useRef(updateFreq);

  const play = useCallback(() => {
    if (!isTimelineInitialized) {
      return;
    }

    if (playHeadStateRef.current === "buffering") {
      return;
    }

    setPlayHeadState({ name: timelineName, state: "playing" });
    if (onPlayListenerRef.current) {
      onPlayListenerRef.current();
    }
  }, [timelineName, isTimelineInitialized]);

  const pause = useCallback(() => {
    setPlayHeadState({ name: timelineName, state: "paused" });
    cancelAnimation();
    if (onPauseListenerRef.current) {
      onPauseListenerRef.current();
    }
  }, [timelineName]);

  const onPlayEvent = useCallback(
    (e: CustomEvent) => {
      if (e.detail.timelineName !== timelineName) {
        return;
      }
      play();
      e.stopPropagation();
    },
    [timelineName, play]
  );

  const onPauseEvent = useCallback(
    (e: CustomEvent) => {
      if (e.detail.timelineName !== timelineName) {
        return;
      }

      pause();
      e.stopPropagation();
    },
    [timelineName, pause]
  );

  const onSeek = useCallback(
    (e: CustomEvent) => {
      if (e.detail.timelineName !== timelineName) {
        return;
      }

      if (onSeekCallbackRefs.current) {
        if (e.detail.start) {
          onSeekCallbackRefs.current.start();
        } else {
          onSeekCallbackRefs.current.end();
        }
      }
      e.stopPropagation();
    },
    [timelineName]
  );

  // animation loop with a controlled frame rate
  // note: be careful when adding any non-ref dependencies to this function
  const animate = useCallback(
    (newTime: DOMHighResTimeStamp) => {
      if (
        playHeadStateRef.current === PLAYHEAD_STATE_PAUSED ||
        playHeadStateRef.current === PLAYHEAD_STATE_WAITING_TO_PAUSE
      ) {
        cancelAnimation();
      }

      const elapsed = newTime - lastDrawTime.current;

      if (elapsed < updateFreqRef.current) {
        // not enough time has passed, skip drawing
        animationId.current = requestAnimationFrame(animate);
        return;
      }

      lastDrawTime.current = newTime - (elapsed % updateFreq);

      // don't commit if: we're at the end of the timeline
      if (frameNumberRef.current === configRef.current.totalFrames) {
        const loopToBeginning = () => {
          const loopToFrameNumber =
            configRef.current.defaultFrameNumber ?? DEFAULT_FRAME_NUMBER;
          setFrameNumber({
            name: timelineName,
            newFrameNumber: loopToFrameNumber,
          }).then(() => {
            frameNumberRef.current = loopToFrameNumber;
            animationId.current = requestAnimationFrame(animate);
          });
        };

        if (configRef.current.loop) {
          loopToBeginning();
        } else {
          // if animation is active, and loop config is off, means we need to stop
          if (isAnimationActiveRef.current) {
            pause();
            // animation was not running and we were paused but got signal to start animating
            // this means video was paused at the end of the timeline
            // start from the beginning
          } else {
            loopToBeginning();
          }
        }
        return;
      }

      isAnimationActiveRef.current = true;

      const targetFrameNumber = frameNumberRef.current + 1;

      // queue next animation before draw
      animationId.current = requestAnimationFrame(animate);

      // usually happens when we're out of frames in store
      if (!isLastDrawFinishedRef.current) {
        queueMicrotask(() => {
          onAnimationStutterRef.current?.();
        });
        return;
      }

      // drawing logic is owned by subscribers and invoked by setFrameNumber
      // we don't increase frame number until the draw is complete
      isLastDrawFinishedRef.current = false;

      setFrameNumber({
        name: timelineName,
        newFrameNumber: targetFrameNumber,
      })
        .then(() => {
          frameNumberRef.current = targetFrameNumber;
        })
        .catch((e) => {
          console.error("error setting frame number", e);
        })
        .finally(() => {
          isLastDrawFinishedRef.current = true;
        });
    },
    [pause, timelineName]
  );

  const startAnimation = useCallback(() => {
    if (
      playHeadState === PLAYHEAD_STATE_PAUSED ||
      playHeadState === PLAYHEAD_STATE_WAITING_TO_PAUSE
    ) {
      cancelAnimation();
    }

    lastDrawTime.current = performance.now();

    animate(lastDrawTime.current);
  }, [playHeadState]);

  const cancelAnimation = useCallback(() => {
    cancelAnimationFrame(animationId.current);
    isAnimationActiveRef.current = false;
    lastDrawTime.current = -1;
  }, []);

  useEventHandler(window, "play", onPlayEvent);
  useEventHandler(window, "pause", onPauseEvent);
  useEventHandler(window, "seek", onSeek);

  const subscribe = useCallback(
    (subscription: SequenceTimelineSubscription) => {
      addSubscriber({ name: timelineName, subscription });
    },
    [addSubscriber, timelineName]
  );

  const refresh = useAtomCallback(
    useCallback(
      (get, set) => {
        const currentFrameNumber = get(getFrameNumberAtom(timelineName));

        set(setFrameNumberAtom, {
          name: timelineName,
          newFrameNumber: currentFrameNumber,
        });
      },
      [timelineName]
    )
  );

  /**
   * This effect synchronizes all timelines with the frame number
   * on load.
   */
  useEffect(() => {
    if (!isTimelineInitialized) {
      return;
    }

    queueMicrotask(() => {
      refresh();
    });
  }, [isTimelineInitialized, refresh]);

  const keyDownHandler = useCallback(
    (e: KeyboardEvent) => {
      // skip if we're in an input field
      if (e.target instanceof HTMLInputElement) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === " ") {
        if (playHeadState === PLAYHEAD_STATE_BUFFERING) {
          return;
        }

        if (playHeadState === PLAYHEAD_STATE_PAUSED) {
          play();
        } else {
          pause();
        }
        e.stopPropagation();
      } else if (key === ",") {
        pause();
        setFrameNumber({
          name: timelineName,
          newFrameNumber: Math.max(frameNumberRef.current - 1, 1),
        });
        e.stopPropagation();
      } else if (key === ".") {
        pause();
        setFrameNumber({
          name: timelineName,
          newFrameNumber: Math.min(
            frameNumberRef.current + 1,
            configRef.current.totalFrames
          ),
        });
        e.stopPropagation();
      }
    },
    [play, pause, playHeadState]
  );

  useKeydownHandler(keyDownHandler);

  const setFrameEventName = useMemo(
    () => getTimelineSetFrameNumberEventName(timelineName),
    [timelineName]
  );

  const setFrameNumberFromEventHandler = useCallback(
    (e: CustomEvent) => {
      pause();
      setFrameNumber({
        name: timelineName,
        newFrameNumber: e.detail.frameNumber,
      });
    },
    [timelineName]
  );

  useEventHandler(window, setFrameEventName, setFrameNumberFromEventHandler);

  const registerOnPlayCallback = useCallback((listener: () => void) => {
    onPlayListenerRef.current = listener;
  }, []);

  const registerOnPauseCallback = useCallback((listener: () => void) => {
    onPauseListenerRef.current = listener;
  }, []);

  const registerOnSeekCallbacks = useCallback(
    ({ start, end }: { start: () => void; end: () => void }) => {
      onSeekCallbackRefs.current = { start, end };
    },
    []
  );

  return {
    /**
     * Whether the timeline has been initialized.
     */
    isTimelineInitialized,
    /**
     * Callback which is invoked when the timeline's playhead state is set to `playing`.
     */
    registerOnPlayCallback,
    /**
     * Callback which is invoked when the timeline's playhead state is set to `paused`.
     */
    registerOnPauseCallback,
    /**
     * Callbacks which are invoked when seeking is being done (start, end).
     */
    registerOnSeekCallbacks,
    /**
     * Re-render all subscribers of the timeline with current frame number.
     */
    refresh,
    /**
     * Set the playhead state of the timeline.
     */
    setPlayHeadState,
    /**
     * Subscribe to the timeline.
     */
    subscribe,
  };
};
