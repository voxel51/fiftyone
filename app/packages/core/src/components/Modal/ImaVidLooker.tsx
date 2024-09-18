import { useTheme } from "@fiftyone/components";
import { AbstractLooker, ImaVidLooker } from "@fiftyone/looker";
import { BaseState } from "@fiftyone/looker/src/state";
import { FoTimelineConfig, useCreateTimeline } from "@fiftyone/playback";
import { useDefaultTimelineName } from "@fiftyone/playback/src/lib/use-default-timeline-name";
import { Timeline } from "@fiftyone/playback/src/views/Timeline";
import * as fos from "@fiftyone/state";
import { useEventHandler, useOnSelectLabel } from "@fiftyone/state";
import { BufferRange } from "@fiftyone/utilities";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { v4 as uuid } from "uuid";
import { useInitializeImaVidSubscriptions, useModalContext } from "./hooks";
import {
  shortcutToHelpItems,
  useClearSelectedLabels,
  useLookerOptionsUpdate,
  useShowOverlays,
} from "./ModalLooker";

interface ImaVidLookerReactProps {
  sample: fos.ModalSample;
}

/**
 * Imavid looker component with a timeline.
 */
export const ImaVidLookerReact = React.memo(
  ({ sample: sampleDataWithExtraParams }: ImaVidLookerReactProps) => {
    const [id] = useState(() => uuid());
    const colorScheme = useRecoilValue(fos.colorScheme);

    const { sample } = sampleDataWithExtraParams;

    const theme = useTheme();
    const initialRef = useRef<boolean>(true);
    const lookerOptions = fos.useLookerOptions(true);
    const [reset, setReset] = useState(false);
    const selectedMediaField = useRecoilValue(fos.selectedMediaField(true));
    const setModalLooker = useSetRecoilState(fos.modalLooker);
    const { subscribeToImaVidStateChanges } =
      useInitializeImaVidSubscriptions();

    const createLooker = fos.useCreateLooker(true, false, {
      ...lookerOptions,
    });

    const { activeLookerRef, setActiveLookerRef } = useModalContext();

    const looker = React.useMemo(
      () => createLooker.current(sampleDataWithExtraParams),
      [reset, createLooker, selectedMediaField]
    ) as AbstractLooker<BaseState>;

    useEffect(() => {
      setModalLooker(looker);
      if (looker instanceof ImaVidLooker) {
        subscribeToImaVidStateChanges();
      }
    }, [looker, subscribeToImaVidStateChanges]);

    useEffect(() => {
      if (looker) {
        setActiveLookerRef(looker as fos.Lookers);
      }
    }, [looker]);

    useEffect(() => {
      !initialRef.current && looker.updateOptions(lookerOptions);
    }, [lookerOptions]);

    useEffect(() => {
      !initialRef.current && looker.updateSample(sample);
    }, [sample, colorScheme]);

    useEffect(() => {
      return () => looker?.destroy();
    }, [looker]);

    const handleError = useErrorHandler();

    const updateLookerOptions = useLookerOptionsUpdate();
    useEventHandler(looker, "options", (e) => updateLookerOptions(e.detail));
    useEventHandler(looker, "showOverlays", useShowOverlays());
    useEventHandler(looker, "reset", () => {
      setReset((c) => !c);
    });

    const jsonPanel = fos.useJSONPanel();
    const helpPanel = fos.useHelpPanel();

    useEventHandler(looker, "select", useOnSelectLabel());
    useEventHandler(looker, "error", (event) => handleError(event.detail));
    useEventHandler(
      looker,
      "panels",
      async ({ detail: { showJSON, showHelp, SHORTCUTS } }) => {
        if (showJSON) {
          const imaVidFrameSample = (looker as ImaVidLooker).thisFrameSample;
          jsonPanel[showJSON](imaVidFrameSample);
        }
        if (showHelp) {
          if (showHelp == "close") {
            helpPanel.close();
          } else {
            helpPanel[showHelp](shortcutToHelpItems(SHORTCUTS));
          }
        }

        updateLookerOptions({}, (updatedOptions) =>
          looker.updateOptions(updatedOptions)
        );
      }
    );

    useEffect(() => {
      initialRef.current = false;
    }, []);

    useEffect(() => {
      looker.attach(id);
    }, [looker, id]);

    useEventHandler(looker, "clear", useClearSelectedLabels());

    const hoveredSample = useRecoilValue(fos.hoveredSample);

    useEffect(() => {
      const hoveredSampleId = hoveredSample?._id;
      looker.updater((state) => ({
        ...state,
        // todo: always setting it to true might not be wise
        shouldHandleKeyEvents: true,
        options: {
          ...state.options,
        },
      }));
    }, [hoveredSample, sample, looker]);

    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
      ref.current?.dispatchEvent(
        new CustomEvent(`looker-attached`, { bubbles: true })
      );
    }, [ref]);

    const loadRange = React.useCallback(async (range: BufferRange) => {
      // no-op, resolve in 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }, []);

    const renderFrame = React.useCallback((frameNumber: number) => {
      (activeLookerRef.current as unknown as ImaVidLooker)?.element.drawFrame(
        frameNumber,
        false,
        true
      );
    }, []);

    const { getName } = useDefaultTimelineName();
    const timelineName = React.useMemo(() => getName(), [getName]);

    const [totalFrameCount, setTotalFrameCount] = useState<number | null>(null);

    const totalFrameCountRef = useRef<number | null>(null);

    const timelineCreationConfig = useMemo(() => {
      // todo: not working because it's resolved in a promise later
      // maybe emit event to update the total frames
      if (!totalFrameCount) {
        return null;
      }

      return {
        totalFrames: totalFrameCount,
        loop: (looker as ImaVidLooker).options.loop,
      } as FoTimelineConfig;
    }, [totalFrameCount, (looker as ImaVidLooker).options.loop]);

    const readyWhen = useCallback(async () => {
      return new Promise<void>((resolve) => {
        // wait for total frame count to be resolved
        let intervalId;
        intervalId = setInterval(() => {
          if (totalFrameCountRef.current) {
            clearInterval(intervalId);
            resolve();
          }
        }, 10);
      });
    }, []);

    const { isTimelineInitialized, subscribe } = useCreateTimeline({
      name: timelineName,
      config: timelineCreationConfig,
      waitUntilInitialized: readyWhen,
    });

    /**
     * This effect subscribes to the timeline.
     */
    useEffect(() => {
      if (isTimelineInitialized) {
        subscribe({
          id: `imavid-${sample._id}`,
          loadRange,
          renderFrame,
        });
      }
    }, [isTimelineInitialized, loadRange, renderFrame, subscribe]);

    /**
     * This effect sets the total frame count by polling the frame store controller.
     */
    useEffect(() => {
      // hack: poll every 10ms for total frame count
      // replace with event listener or callback
      let intervalId = setInterval(() => {
        const totalFrameCount = (
          activeLookerRef.current as unknown as ImaVidLooker
        ).frameStoreController.totalFrameCount;
        if (totalFrameCount) {
          setTotalFrameCount(totalFrameCount);
          clearInterval(intervalId);
        }
      }, 10);

      return () => clearInterval(intervalId);
    }, [looker]);

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          ref={ref}
          id={id}
          data-cy="modal-looker-container"
          style={{
            width: "100%",
            height: "100%",
            background: theme.background.level2,
            position: "relative",
          }}
        />
        <Timeline
          name={timelineName}
          style={{
            position: "absolute",
            bottom: 0,
            width: "100%",
            height: "43px",
            zIndex: 1,
          }}
          controlsStyle={{
            marginLeft: "1em",
          }}
        />
      </div>
    );
  }
);
