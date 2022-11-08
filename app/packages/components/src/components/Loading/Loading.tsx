import React from "react";
import classNames from "classnames";

import { ellipsis, loading } from "./Loading.module.css";

const Loading: React.FC<
  React.PropsWithChildren<{
    style?: React.CSSProperties;
    ellipsisAnimation?: boolean;
  }>
> = ({ children, ellipsisAnimation = false, style }) => {
  return (
    <div
      className={ellipsisAnimation ? classNames(ellipsis, loading) : loading}
      style={style}
    >
      <div>{children}</div>
    </div>
  );
};

export default Loading;
