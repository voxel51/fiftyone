import { Box } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";
import PillBadge from "@fiftyone/components/src/components/PillBadge/PillBadge";

export default function PillBadgeView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { text, color, variant, showIcon } = view;

  return (
    <Box {...getComponentProps(props, "container")}>
      <PillBadge
        text={text}
        color={color}
        variant={variant}
        showIcon={showIcon}
        {...getComponentProps(props, "pillBadge")}
      />
    </Box>
  );
}
