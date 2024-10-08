import { Box } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";
import PillBadge from "@fiftyone/components/src/components/PillBadge/PillBadge";

export default function PillBadgeView(props) {
  const { schema } = props;
  const { view = {} } = schema;

  return (
    <Box {...getComponentProps(props, "container")}>
      <PillBadge text={"..."} {...getComponentProps(props, "pillBadge")} />
    </Box>
  );
}
