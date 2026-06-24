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
} from "./state";
import {
  DEFAULT_FRAME_NUMBER,
  PLAYHEAD_STATE_BUFFERING,
  PLAYHEAD_STATE_PAUSED,
  PLAYHEAD_STATE_PLAYING,
  PLAYHEAD_STATE_WAITING_TO_PAUSE,
} from "../constants";
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

  useEffect(() => {
    onAnimationStutterRef.current = newTimelineProps.onAnimationStutter;
  }, [newTimelineProps.onAnimationStutter]);

  useEffect(() => {
    // a missing config can be used to delay timeline initialization
    if (!newTimelineProps.config) {
      return undefined;
    }

    addTimeline({ name: timelineName, config: newTimelineProps.config });

    // bring this timeline to the front of the LRU cache
    _INTERNAL_timelineConfigsLruCache.get(timelineName);

    return () => {
      pause();
      // timeline cleanup runs in the LRU cache's dispose()
    };

    // config isn't a dep because it's not guaranteed referentially stable;
    // depend on its primitive/stable constituents instead
  }, [
    addTimeline,
    timelineName,
    newTimelineProps.waitUntilInitialized,
    newTimelineProps.optOutOfAnimation,
    newTimelineProps.config?.loop,
    newTimelineProps.config?.totalFrames,
  ]);

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

  // binds to externally-set frame numbers; the external setter must pause
  // (dispatch a pause event) first for this to take effect
  useEffect(() => {
    if (!isAnimationActiveRef.current) {
      frameNumberRef.current = frameNumber;
    }
  }, [frameNumber]);

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

    if (playHeadStateRef.current === PLAYHEAD_STATE_BUFFERING) {
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

      // Use the ref so a closure-captured stale `updateFreq` can't drift
      // the frame timing across re-renders.
      lastDrawTime.current = newTime - (elapsed % updateFreqRef.current);

      // at the end of the timeline: loop or stop, unless streaming (totalFrames is
      // only the provisional buffered end, so fall through and wait for more frames)
      if (
        frameNumberRef.current === configRef.current.totalFrames &&
        !configRef.current.streaming
      ) {
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
          if (isAnimationActiveRef.current) {
            pause();
            // restarting from a pause at the end of the timeline: loop to the beginning
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
    // updateFreq is read via updateFreqRef.current.
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

      if (newTimelineProps.optOutOfAnimation) {
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
    [
      play,
      pause,
      playHeadState,
      timelineName,
      setFrameNumber,
      newTimelineProps.optOutOfAnimation,
    ]
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
    [timelineName, pause, setFrameNumber]
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
