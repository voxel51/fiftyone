import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { Box } from "@mui/material";
import { snakeCase } from "lodash";
import React from "react";
import ReactPlayer from "react-player";
import { getComponentProps } from "../utils";
import HeaderView from "./HeaderView";

export default function MediaPlayerView(props) {
  const { schema, data } = props;
  const { default: defaultValue } = schema;
  const value = data ?? defaultValue;
  const mediaUrl = typeof value === "string" ? value : value?.url;
  const { view = {} } = schema;
  const panelId = usePanelId();
  const triggerEvent = usePanelEvent();

  const handleEvent =
    (event) =>
    (...args) => {
      let params: any = {};
      const eventKey = snakeCase(event);
      if (event === "onReady") {
        params.duration = args[0];
      }
      if (event === "onSeek") {
        params.seconds = args[0];
      }
      if (event === "onProgress") {
        params = args[0];
      }
      if (event === "onError") {
        params.error = args[0];
        params.data = args[1];
      }
      const operator = view[eventKey];
      if (panelId && operator) {
        triggerEvent(panelId, { operator, params });
      }
    };

  const eventHandlers = {
    onStart: handleEvent("onStart"),
    onPlay: handleEvent("onPlay"),
    onPause: handleEvent("onPause"),
    onBuffer: handleEvent("onBuffer"),
    onBufferEnd: handleEvent("onBufferEnd"),
    onEnded: handleEvent("onEnded"),
    onError: handleEvent("onError"),
    onDuration: handleEvent("onDuration"),
    onSeek: handleEvent("onSeek"),
    onProgress: handleEvent("onProgress"),
  };

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <ReactPlayer
        url={mediaUrl}
        {...view}
        {...eventHandlers}
        {...getComponentProps(props, "react-player")}
      />
    </Box>
  );
}
