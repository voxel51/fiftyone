import React from "react";
import ReactPlayer from "react-player";
import { Box } from "@mui/material";
import HeaderView from "./HeaderView";
import { getComponentProps } from "../utils";

export default function MediaPlayerView(props) {
  const { schema, data } = props;
  const { default: defaultValue, playerProps = {} } = schema;
  const actualData = data ?? defaultValue;
  const mediaUrl = actualData?.url;

  const handleEvent =
    (event) =>
    (...args) => {
      console.log(`Video event: ${event}`, ...args);
      // Add your custom logic for different events if needed
    };

  const eventHandlers = {
    onPlay: handleEvent("onPlay"),
    onPause: handleEvent("onPause"),
    onEnded: handleEvent("onEnded"),
    onError: handleEvent("onError"),
    onProgress: handleEvent("onProgress"),
    onDuration: handleEvent("onDuration"),
    onSeek: handleEvent("onSeek"),
  };

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <ReactPlayer
        url={mediaUrl}
        {...playerProps}
        {...eventHandlers}
        {...getComponentProps(props, "react-player")}
      />
    </Box>
  );
}
