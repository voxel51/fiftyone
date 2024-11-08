import { DEFAULT_ANIMATION_DURATION } from "@fiftyone/teams-state/src/constants";
import { BoxProps } from "@mui/material";
import Box from "@mui/material/Box";
import { PropsWithChildren } from "react";

export default function HoverVisible(
  props: PropsWithChildren<HoverVisiblePropsType>
) {
  const {
    isHovering = false,
    duration = DEFAULT_ANIMATION_DURATION,
    children,
    ...boxProps
  } = props;

  return (
    <Box
      {...boxProps}
      sx={{
        visibility: !isHovering ? "hidden" : "visible",
        opacity: !isHovering ? "0" : "1",
        transition: `visibility 0s, opacity ${duration}s linear`,
        ...(boxProps?.sx || {}),
      }}
    >
      {children}
    </Box>
  );
}

type HoverVisiblePropsType = BoxProps & {
  isHovering?: boolean;
  duration?: number;
};
