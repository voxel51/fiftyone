import React, {
  useState,
  useRef,
  MutableRefObject,
  useEffect,
  useMemo,
} from "react";
import ReactDOM from "react-dom";
import styled from "styled-components";
import { useRecoilValue, useRecoilCallback } from "recoil";
import { animated, useSpring } from "@react-spring/web";
import { v4 as uuid } from "uuid";

import { ContentDiv, ContentHeader } from "../utils";
import { useEventHandler } from "../../utils/hooks";

import { useErrorHandler } from "react-error-boundary";
import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useOnSelectLabel } from "@fiftyone/state";
import { TooltipInfo } from "./TooltipInfo";

type EventCallback = (event: CustomEvent) => void;

const useLookerOptionsUpdate = () => {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (event: CustomEvent) => {
        const currentOptions = await snapshot.getPromise(
          fos.savedLookerOptions
        );
        set(fos.savedLookerOptions, { ...currentOptions, ...event.detail });
      }
  );
};

const useFullscreen = () => {
  return useRecoilCallback(({ set }) => async (event: CustomEvent) => {
    set(fos.fullscreen, event.detail);
  });
};

const useShowOverlays = () => {
  return useRecoilCallback(({ set }) => async (event: CustomEvent) => {
    set(fos.showOverlays, event.detail);
  });
};

const useClearSelectedLabels = () => {
  return useRecoilCallback(
    ({ set }) =>
      async () =>
        set(fos.selectedLabels, {}),
    []
  );
};

interface LookerProps {
  lookerRef?: MutableRefObject<any>;
  onClose?: EventCallback;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onNext?: EventCallback;
  onPrevious?: EventCallback;
}

const Looker = ({ lookerRef, onClose, onNext, onPrevious }: LookerProps) => {
  const [id] = useState(() => uuid());

  const sampleData = useRecoilValue(fos.modal);
  if (!sampleData) {
    throw new Error("bad");
  }
  const { sample } = sampleData;

  const theme = useTheme();
  const initialRef = useRef<boolean>(true);
  const lookerOptions = fos.useLookerOptions(true);
  const createLooker = fos.useCreateLooker(true, false, {
    ...lookerOptions,
    hasNext: Boolean(onNext),
    hasPrevious: Boolean(onPrevious),
  });
  const looker = React.useMemo(
    () => createLooker.current(sampleData),
    [useRecoilValue(fos.selectedMediaField(true)), createLooker]
  );

  useEffect(() => {
    !initialRef.current && looker.updateOptions(lookerOptions);
  }, [lookerOptions]);

  useEffect(() => {
    !initialRef.current && looker.updateSample(sample);
  }, [sample]);

  useEffect(() => {
    return () => looker && looker.destroy();
  }, [looker]);

  const handleError = useErrorHandler();
  lookerRef && (lookerRef.current = looker);

  useEventHandler(looker, "options", useLookerOptionsUpdate());
  useEventHandler(looker, "fullscreen", useFullscreen());
  useEventHandler(looker, "showOverlays", useShowOverlays());

  useEventHandler(looker, "close", onClose);

  useEventHandler(
    looker,
    "next",
    onNext
      ? (e) => {
          jsonPanel.close();
          helpPanel.close();
          return onNext(e);
        }
      : null
  );
  useEventHandler(
    looker,
    "previous",
    onPrevious
      ? (e) => {
          jsonPanel.close();
          helpPanel.close();
          return onPrevious(e);
        }
      : null
  );
  useEventHandler(looker, "select", useOnSelectLabel());
  useEventHandler(looker, "error", (event) => handleError(event.detail));
  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();
  useEventHandler(looker, "options", (e) => {
    const { detail } = e;
    const { showJSON, showHelp, SHORTCUTS } = detail || {};
    if (showJSON === true) {
      jsonPanel.open(sample);
    }
    if (showJSON === false) {
      jsonPanel.close();
    }
    if (showHelp === true) {
      helpPanel.open(shortcutToHelpItems(SHORTCUTS));
    }
    if (showHelp === false) {
      helpPanel.close();
    }
  });

  onClose && useEventHandler(looker, "close", onClose);

  useEffect(() => {
    initialRef.current = false;
  }, []);

  useEffect(() => {
    looker.attach(id);
  }, [looker, id]);

  useEventHandler(looker, "clear", useClearSelectedLabels());

  const tooltip = fos.useTooltip();
  useEventHandler(looker, "tooltip", (e) => {
    tooltip.setDetail(e.detail ? e.detail : null);
    e.detail && tooltip.setCoords(e.detail.coordinates);
  });

  const hoveredSample = useRecoilValue(fos.hoveredSample);
  useEffect(() => {
    looker.updater((state) => ({
      ...state,
      shouldHandleKeyEvents: hoveredSample._id === sample._id,
      options: {
        ...state.options,
      },
    }));
  }, [hoveredSample, sample, looker]);

  return (
    <div
      id={id}
      style={{
        width: "100%",
        height: "100%",
        background: theme.backgroundDark,
        position: "relative",
      }}
    >
      <TooltipInfo coordinates={tooltip.coordinates} />
    </div>
  );
};

export default React.memo(Looker);

function shortcutToHelpItems(SHORTCUTS) {
  return Object.values(SHORTCUTS);
}
