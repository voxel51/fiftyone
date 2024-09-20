import { Optional, useEventHandler, useKeyDown } from "@fiftyone/state";
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
import { DEFAULT_FRAME_NUMBER } from "./constants";
import { useDefaultTimelineName } from "./use-default-timeline-name";

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
  const { getName } = useDefaultTimelineName();
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
    newTimelineProps.config?.loop,
    newTimelineProps.config?.totalFrames,
  ]);

  /**
   * this effect starts or stops the animation
   * based on the playhead state
   */
  useEffect(() => {
    if (playHeadState === "playing") {
      startAnimation();
    }

    if (playHeadState === "paused") {
      cancelAnimation();
    }

    playHeadStateRef.current = playHeadState;
  }, [playHeadState]);

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
  const lastDrawTime = useRef(-1);
  const playHeadStateRef = useRef(playHeadState);
  const updateFreqRef = useRef(updateFreq);

  const play = useCallback(() => {
    setPlayHeadState({ name: timelineName, state: "playing" });
  }, [timelineName]);

  const pause = useCallback(() => {
    setPlayHeadState({ name: timelineName, state: "paused" });
    cancelAnimation();
  }, [timelineName]);

  const onPlayEvent = useCallback(
    (e: CustomEvent) => {
      if (e.detail.timelineName !== timelineName) {
        return;
      }

      play();
      e.stopPropagation();
    },
    [timelineName]
  );

  const onPauseEvent = useCallback(
    (e: CustomEvent) => {
      if (e.detail.timelineName !== timelineName) {
        return;
      }

      pause();
      e.stopPropagation();
    },
    [timelineName]
  );

  // animation loop with a controlled frame rate
  // note: be careful when adding any non-ref dependencies to this function
  const animate = useCallback(
    (newTime: DOMHighResTimeStamp) => {
      if (
        playHeadStateRef.current === "paused" ||
        playHeadStateRef.current === "waitingToPause"
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

      if (!isLastDrawFinishedRef.current) {
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
        .finally(() => {
          isLastDrawFinishedRef.current = true;
        });
    },
    [pause, timelineName]
  );

  const startAnimation = useCallback(() => {
    if (playHeadState === "paused" || playHeadState === "waitingToPause") {
      cancelAnimation();
    }

    lastDrawTime.current = performance.now();

    animate(lastDrawTime.current);
  }, [playHeadState]);

  const cancelAnimation = useCallback(() => {
    cancelAnimationFrame(animationId.current);
    isAnimationActiveRef.current = false;
  }, []);

  useEventHandler(window, "play", onPlayEvent);
  useEventHandler(window, "pause", onPauseEvent);

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

  const spaceKeyDownHandler = useCallback(
    (_, e: KeyboardEvent) => {
      // skip if we're in an input field
      if (e.target instanceof HTMLInputElement) {
        return;
      }

      if (playHeadState === "paused") {
        play();
      } else {
        pause();
      }
      e.stopPropagation();
      e.preventDefault();
    },
    [play, pause, playHeadState]
  );

  useKeyDown(" ", spaceKeyDownHandler, [spaceKeyDownHandler]);

  return { isTimelineInitialized, refresh, subscribe };
};
