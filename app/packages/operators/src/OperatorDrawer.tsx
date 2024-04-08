import { Resizable } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import { IconButton } from "@mui/material";
import { useState } from "react";
import { useOperatorPrompt } from "./state";
import { Prompting, withOperatorPrompt } from "./OperatorPrompt";

const DEFAULT_WIDTH = 250;
const RIGHT_RESIZE_PLACEMENTS = ["left", "sample-view-left"];

function OperatorDrawer(props: OperatorDrawerProps) {
  const { placementArea } = props;
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const operatorPrompt = useOperatorPrompt();
  const { name, placement } = operatorPrompt?.promptView || {};
  const direction = RIGHT_RESIZE_PLACEMENTS.includes(placementArea)
    ? "right"
    : "left";

  if (name !== "DrawerView" || placementArea !== placement) return null;

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
    >
      <IconButton
        onClick={operatorPrompt.close}
        sx={{ position: "absolute", top: 0, right: 0 }}
      >
        <Close />
      </IconButton>
      <Prompting operatorPrompt={operatorPrompt} />
    </Resizable>
  );
}

type OperatorDrawerProps = {
  placementArea: "left" | "right" | "sample-view-left" | "sample-view-right";
};

export default withOperatorPrompt(OperatorDrawer);
