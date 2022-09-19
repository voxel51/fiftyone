import { useTheme } from "@fiftyone/components";
import { CircularProgress } from "@material-ui/core";
import React from "react";

const LoadingCircle: React.FC = () => {
  const theme = useTheme();
  return (
    <CircularProgress
      style={{
        color: theme.fontDark,
        height: 16,
        width: 16,
        margin: 4,
      }}
    />
  );
};

export default LoadingCircle;
