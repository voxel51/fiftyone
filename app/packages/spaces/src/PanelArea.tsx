import { Resizable } from "@fiftyone/components";
import { usePanelAreaRenderer } from "./hooks";
import { PanelAreaProps } from "./types";
import { useState } from "react";

const DEFAULT_WIDTH = 450;
const DEFAULT_MIN_WIDTH = "0%";
const DEFAULT_MAX_WIDTH = "100%";

export default function PanelArea(props: PanelAreaProps) {
  const { id, resize } = props;
  const { defaultWidth, minWidth, maxWidth, direction } = resize || {};
  const computedDefaultWidth = defaultWidth || DEFAULT_WIDTH;
  const [width, setWidth] = useState(computedDefaultWidth);

  const { currentRendererId, CurrentRenderer } = usePanelAreaRenderer(id);

  if (!currentRendererId) return null;

  if (resize) {
    return (
      <Resizable
        size={{ height: "100%", width }}
        minWidth={minWidth ?? DEFAULT_MIN_WIDTH}
        maxWidth={maxWidth ?? DEFAULT_MAX_WIDTH}
        direction={direction}
        onResizeStop={(_, __, ___, { width: delta }) => {
          setWidth((width) => width + delta);
        }}
        onResizeReset={() => {
          setWidth(computedDefaultWidth);
        }}
      >
        {CurrentRenderer}
      </Resizable>
    );
  }

  return CurrentRenderer;
}
