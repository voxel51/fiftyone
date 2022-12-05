import React from "react";

import { loading } from "./LoadingDots.module.css";

const LoadingDots = ({ text, color }: { text: string; color?: string }) => {
  return (
    <span style={color ? { color } : {}}>
      {text}
      <span className={loading} />
    </span>
  );
};

export default LoadingDots;
