import { Box } from "@fiftyone/teams-components";
import { BoxProps } from "@mui/material";

export type ColorCircleProps = BoxProps & {
  color: string;
};

export default function ColorCircle({ color, ...props }: ColorCircleProps) {
  return (
    <Box
      {...props}
      sx={{
        backgroundColor: color,
        borderRadius: "50%",
        height: 8,
        width: 8,
        ...(props.sx || {}),
      }}
    />
  );
}
