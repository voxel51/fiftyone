import { Box } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";
import { getComponentProps } from "../utils";
import { usePanelId } from "@fiftyone/spaces";
import { usePanelEvent } from "@fiftyone/operators";

export default function ImageView(props) {
  const { schema, data } = props;
  const {
    height,
    width,
    alt,
    href,
    operator,
    prompt = false,
    params,
  } = schema?.view || {};
  const imageURI = data ?? schema?.default;

  const panelId = usePanelId();
  const handleClick = usePanelEvent();

  const onClick = () => {
    // ordering matters: execute operator first then redirect if defined

    if (operator) {
      handleClick(panelId, {
        params: params,
        operator,
        prompt,
      });
    }

    if (href) {
      window.open(href, "_blank");
    }
  };

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <img
        src={imageURI}
        height={height}
        width={width}
        alt={alt}
        onClick={onClick}
        style={{ cursor: href ? "pointer" : "default" }} // Change cursor based on href
        {...getComponentProps(props, "image")}
      />
    </Box>
  );
}
