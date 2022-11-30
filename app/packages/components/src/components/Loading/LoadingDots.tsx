import React from "react";

import { loading } from "./LoadingDots.module.css";

const LoadingDots = ({ text, color }: { text: string; color?: string }) => {
  return (
    <span className={loading} style={color ? { color } : {}}>
      {text}
      <span></span>
      <span></span>
      <span></span>
    </span>
  );
};

export default LoadingDots;
