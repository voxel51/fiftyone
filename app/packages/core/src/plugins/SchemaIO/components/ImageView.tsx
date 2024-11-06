import { Box } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";
import { getComponentProps } from "../utils";
import { usePanelId } from "@fiftyone/spaces";
import { usePanelEvent } from "@fiftyone/operators";
import { OperatorResult } from "@fiftyone/operators/src/operators";

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
    cursor = false,
  } = schema?.view || {};
  const imageURI = data ?? schema?.default;

  const panelId = usePanelId();
  const handleClick = usePanelEvent();

  const openLink = () => href && window.open(href, "_blank");

  const onClick = () => {
    if (operator) {
      handleClick(panelId, {
        params: params,
        operator,
        prompt,
        callback: (result: OperatorResult) => {
          // execution after operator

          if (result?.error) {
            console.log(result?.error);
            console.log(result?.errorMessage);
          } else {
            openLink();
          }
        },
      });
    } else {
      // execute if operator not defined
      openLink();
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
        style={{ cursor: cursor ? "pointer" : "default" }} // Change cursor based on href
        {...getComponentProps(props, "image")}
      />
    </Box>
  );
}
