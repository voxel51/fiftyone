import { LoadingDots, useTheme } from "@fiftyone/components";
import type { CSSProperties } from "react";
import React from "react";

const Loading = ({ style }: { style?: CSSProperties }) => {
  const theme = useTheme();
  return (
    <LoadingDots
      text=""
      style={{ color: theme.text.primary, ...(style ?? {}) }}
    />
  );
};

export default Loading;
