import { Stack, StackProps } from "@mui/material";
import React, { PropsWithChildren } from "react";

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
