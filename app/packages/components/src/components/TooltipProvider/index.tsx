import { Box, Tooltip, TooltipProps } from "@mui/material";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default function TooltipProvider(props: TooltipProps) {
  const { title, children, ...tooltipProps } = props;
  if (!title) return children;
  return (
    <Tooltip title={title} {...tooltipProps}>
      <Box>{children}</Box>
    </Tooltip>
  );
}
