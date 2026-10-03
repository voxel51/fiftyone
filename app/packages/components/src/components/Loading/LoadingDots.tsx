import React from "react";

import styles from "./LoadingDots.module.css";

const LoadingDots = ({
  text,
  style,
}: {
  text?: string;
  color?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <span data-cy="loading-dots" style={style ?? {}}>
      {text}
      <span className={styles.loading} />
    </span>
  );
};

export default LoadingDots;
