import React from "react";

import { CircularProgress } from "@mui/material";

const LoadingSpinner = ({
  color = "base",
  size = "medium",
}: {
  color?: string;
  size?: string;
}) => {
  const COLORS: { [key: string]: string } = {
    base: "#FFC59B",
    primary: "primary",
    secondary: "secondary",
    error: "error",
    warning: "warning",
    info: "info",
    success: "success",
  };
  const SIZES: { [key: string]: string } = {
    small: "1rem",
    medium: "2rem",
    large: "3rem",
  };
  return <CircularProgress sx={{ color: COLORS[color] }} size={SIZES[size]} />;
};

export default LoadingSpinner;
