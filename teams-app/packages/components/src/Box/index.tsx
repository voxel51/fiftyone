import { Box as MUIBox, BoxProps } from "@mui/material";
import { forwardRef } from "react";

function Box(props: BoxProps, ref: React.Ref<unknown>) {
  return <MUIBox ref={ref} {...props} />;
}

export default forwardRef(Box);
