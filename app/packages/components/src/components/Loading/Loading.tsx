import classNames from "classnames";
import React from "react";
import styles from "./Loading.module.css";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
const Loading: React.FC<
  React.PropsWithChildren<{
    dataCy?: string;
    ellipsisAnimation?: boolean;
    style?: React.CSSProperties;
    wrapperStyle?: React.CSSProperties;
  }>
> = ({ children, dataCy, ellipsisAnimation = false, style, wrapperStyle }) => {
  return (
    <div
      data-cy={dataCy}
      className={
        ellipsisAnimation
          ? classNames(styles.ellipsis, styles.loading)
          : styles.loading
      }
      style={style}
    >
      <div style={wrapperStyle}>{children}</div>
    </div>
  );
};

export default Loading;
