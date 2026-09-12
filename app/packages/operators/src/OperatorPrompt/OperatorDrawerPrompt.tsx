import { Resizable } from "@fiftyone/components";
import { useState } from "react";
import OperatorPromptFrame from "../components/OperatorPromptFrame";
import { OperatorPromptPropsType } from "../types";

const DEFAULT_WIDTH = 250;
const RIGHT_RESIZE_PLACEMENTS = ["left", "sample-view-left"];

export default function OperatorDrawerPrompt(props: OperatorPromptPropsType) {
  const { prompt } = props;
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const placement = prompt?.promptView?.placement;
  const direction = RIGHT_RESIZE_PLACEMENTS.includes(placement)
    ? "right"
    : "left";

  return (
    <Resizable
      direction={direction}
      size={{ height: "100%", width }}
      minWidth={200}
      maxWidth={600}
      onResizeStop={(_, __, ____, { width: delta }) => {
        setWidth(width + delta);
      }}
      onResizeReset={() => {
        setWidth(DEFAULT_WIDTH);
      }}
      data-cy="operators-prompt-drawer"
    >
      <OperatorPromptFrame
        prompt={prompt}
        dataCyPrefix="operators-prompt-drawer"
      />
    </Resizable>
  );
}
