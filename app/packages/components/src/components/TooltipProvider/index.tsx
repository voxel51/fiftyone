import { Box, Tooltip, TooltipProps } from "@mui/material";

export default function TooltipProvider(props: TooltipProps) {
  const { title, children, ...tooltipProps } = props;
  if (!title) return children;
  return (
    <Tooltip title={title} {...tooltipProps}>
      <Box>{children}</Box>
    </Tooltip>
  );
}
