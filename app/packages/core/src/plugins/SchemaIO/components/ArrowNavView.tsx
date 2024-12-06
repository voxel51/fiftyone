import {
  Arrow,
  LookerArrowLeftIcon,
  LookerArrowRightIcon,
} from "@fiftyone/components";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import React from "react";
import { ViewPropsType } from "../utils/types";

export default function ArrowNavView(props: ViewPropsType) {
  const { schema, otherProps } = props;
  const { view = {} } = schema;
  const {
    on_backward,
    on_forward,
    position = "center",
    forward = true,
    backward = true,
  } = view;
  const panelId = usePanelId();
  const handleClick = usePanelEvent();
  const backwardStyles = positionBasedStyleBackward[position] || {};
  const forwardStyles = positionBasedStyleForward[position] || {};
  const { isModalPanel } = otherProps;
  const zIndex = isModalPanel ? 1501 : 1000;

  return (
    <>
      {backward && (
        <Arrow
          style={{ ...backwardStyles, zIndex }}
          onClick={() => {
            if (on_backward) {
              handleClick(panelId, { operator: on_backward });
            }
          }}
        >
          <LookerArrowLeftIcon />
        </Arrow>
      )}
      {forward && (
        <Arrow
          $isRight
          style={{ ...forwardStyles, zIndex }}
          onClick={() => {
            if (on_forward) {
              handleClick(panelId, { operator: on_forward });
            }
          }}
        >
          <LookerArrowRightIcon />
        </Arrow>
      )}
    </>
  );
}

const positionBasedStyleBackward = {
  top: { top: "0.5rem", left: "0.5rem", bottom: "unset", right: "unset" },
  center: {
    top: "50%",
    left: "0.5rem",
    bottom: "unset",
    right: "unset",
    transform: "translateY(-50%)",
  },
  bottom: { top: "unset", left: "0.5rem", bottom: "0.5rem", right: "unset" },
  left: {
    top: "0.5rem",
    left: "0.5rem",
    bottom: "unset",
    right: "unset",
    transform: "rotate(90deg)",
  },
  middle: {
    top: "0.5rem",
    left: "50%",
    bottom: "unset",
    right: "unset",
    transform: "rotate(90deg) translateY(50%)",
  },
  right: {
    top: "0.5rem",
    left: "unset",
    bottom: "unset",
    right: "0.5rem",
    transform: "rotate(90deg)",
  },
};

const positionBasedStyleForward = {
  top: { top: "0.5rem", left: "unset", bottom: "unset", right: "0.5rem" },
  center: {
    top: "50%",
    left: "unset",
    bottom: "unset",
    right: "0.5rem",
    transform: "translateY(-50%)",
  },
  bottom: { top: "unset", left: "unset", bottom: "0.5rem", right: "0.5rem" },
  left: {
    top: "unset",
    left: "0.5rem",
    bottom: "0.5rem",
    right: "unset",
    transform: "rotate(90deg)",
  },
  middle: {
    top: "unset",
    left: "50%",
    bottom: "0.5rem",
    right: "unset",
    transform: "rotate(90deg) translateY(50%)",
  },
  right: {
    top: "unset",
    left: "unset",
    bottom: "0.5rem",
    right: "0.5rem",
    transform: "rotate(90deg)",
  },
};
