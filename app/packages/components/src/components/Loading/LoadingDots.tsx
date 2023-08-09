import React from "react";

import { loading } from "./LoadingDots.module.css";

const LoadingDots = ({
  text,
  style,
}: {
  text: string;
  color?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <span style={style ?? {}}>
      {text}
      <span className={loading} />
    </span>
  );
};

export default LoadingDots;
