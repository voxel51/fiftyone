import React from "react";

import { loading } from "./LoadingDots.module.css";

const LoadingDots = ({ text }: { text: string }) => {
  return <div className={loading}>{text}</div>;
};

export default LoadingDots;
