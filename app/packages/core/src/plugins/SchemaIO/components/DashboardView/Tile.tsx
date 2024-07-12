import { Resizable } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { throttle } from "lodash";
import { useRefresh } from "muuri-react";
import React, { PropsWithChildren, useState } from "react";

const HEADING_HEIGHT = 32;

export default function Tile(props: TilePropsType) {
  const {
    value,
    title,
    defaultHeight,
    defaultWidth,
    gap = 4,
    children,
    onClose,
  } = props;
  const [width, setWidth] = useState(defaultWidth || 200);
  const [height, setHeight] = useState(defaultHeight || 200);
  const refresh = useRefresh();
  const throttledRefresh = throttle(() => requestAnimationFrame(refresh), 100);

  return (
    <Resizable
      direction="right"
      minWidth={200}
      maxWidth={600}
      onResize={throttledRefresh}
      onResizeStop={(e, direction, ref, delta) => {
        if (delta.width > 0) setWidth(width + delta.width);
        if (delta.height > 0) setHeight(height + delta.height);
      }}
      size={{ height, width }}
      style={{ margin: gap }}
    >
      {(title || onClose) && (
        <Stack
          sx={{
            width: "100%",
            bgcolor: (theme) => theme.palette.background.level3,
            px: 1,
            cursor: "move",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          direction="row"
          className={"tile-heading"}
        >
          <Typography>{title}</Typography>
          <Stack direction="row">
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                console.log(">>>", onClose);
                onClose?.(value);
              }}
            >
              <Close sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        </Stack>
      )}
      <Box
        sx={{ overflow: "auto", height: `calc(100% - ${HEADING_HEIGHT}px)` }}
      >
        {children}
      </Box>
    </Resizable>
  );
}

type TilePropsType = PropsWithChildren<{
  id: string;
  title?: string;
  defaultHeight?: number;
  defaultWidth?: number;
  gap?: number;
  onClose?: (id: string) => void;
}>;
