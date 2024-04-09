import { Resizable } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import { Box, IconButton, Stack } from "@mui/material";
import { useState } from "react";
import { withOperatorPrompt } from "./OperatorPrompt";
import OperatorPromptBody from "./components/OperatorPromptBody";
import { useOperatorPrompt } from "./state";
import OperatorPromptFooter from "./components/OperatorPromptFooter";
import { getOperatorPromptConfigs } from "./utils";
import OperatorPromptHeader from "./components/OperatorPromptHeader";

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

  const { title, ...otherConfigs } = getOperatorPromptConfigs(operatorPrompt);

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
      <Box sx={{ p: 1 }}>
        <OperatorPromptHeader title={title} />
      </Box>
      <OperatorPromptBody operatorPrompt={operatorPrompt} />
      <Stack direction="row" spacing={1} justifyContent="center">
        <OperatorPromptFooter {...otherConfigs} />
      </Stack>
    </Resizable>
  );
}

type OperatorDrawerProps = {
  placementArea: "left" | "right" | "sample-view-left" | "sample-view-right";
};

export default withOperatorPrompt(OperatorDrawer);
