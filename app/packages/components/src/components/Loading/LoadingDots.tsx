import React from "react";

import styles from "./LoadingDots.module.css";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
const LoadingDots = ({
  text,
  style,
}: {
  text?: string;
  color?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <span style={style ?? {}}>
      {text}
      <span className={styles.loading} />
    </span>
  );
};

export default LoadingDots;
