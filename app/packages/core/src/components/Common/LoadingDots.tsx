import React from "react";

import { loading } from "./LoadingDots.module.css";

const LoadingDots = ({ text }: { text: string }) => {
  return <span className={loading}>{text}</span>;
};

export default LoadingDots;
