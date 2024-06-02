import { Resizable, scrollable } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import { Box, IconButton, Stack } from "@mui/material";
import { useState } from "react";
import OperatorPromptBody from "../components/OperatorPromptBody";
import OperatorPromptFooter from "../components/OperatorPromptFooter";
import OperatorPromptHeader from "../components/OperatorPromptHeader";
import { OperatorPromptPropsType } from "../types";
import { getOperatorPromptConfigs } from "../utils";

const DEFAULT_WIDTH = 250;
const RIGHT_RESIZE_PLACEMENTS = ["left", "sample-view-left"];

export default function OperatorDrawerPrompt(props: OperatorPromptPropsType) {
  const { prompt } = props;
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const { title, ...otherConfigs } = getOperatorPromptConfigs(prompt);
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
      <IconButton
        onClick={prompt.close}
        sx={{ position: "absolute", top: 0, right: 0 }}
      >
        <Close />
      </IconButton>
      <Box sx={{ p: 1 }}>
        <OperatorPromptHeader title={title} />
      </Box>
      <Box
        data-cy="operators-prompt-drawer-content"
        sx={{ overflow: "auto" }}
        className={scrollable}
      >
        <OperatorPromptBody operatorPrompt={prompt} />
      </Box>
      <Stack
        direction="row"
        spacing={1}
        justifyContent="center"
        alignItems="center"
        data-cy="operators-prompt-drawer-footer"
        sx={{ py: 1 }}
      >
        <OperatorPromptFooter {...otherConfigs} />
      </Stack>
    </Resizable>
  );
}
