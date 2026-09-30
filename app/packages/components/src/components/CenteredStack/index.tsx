import { Stack, StackProps } from "@mui/material";
import { PropsWithChildren } from "react";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default function CenteredStack(props: CenteredStackPropsType) {
  const { children, sx = {}, ...otherProps } = props;
  return (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        ...sx,
      }}
      {...otherProps}
    >
      {children}
    </Stack>
  );
}

type CenteredStackPropsType = PropsWithChildren<StackProps>;
