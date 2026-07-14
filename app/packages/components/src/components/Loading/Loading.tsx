import classNames from "classnames";
import React from "react";
import styles from "./Loading.module.css";

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
