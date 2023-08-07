import classNames from "classnames";
import React from "react";
import { ellipsis, loading } from "./Loading.module.css";

const Loading: React.FC<
  React.PropsWithChildren<{
    dataCy?: string;
    ellipsisAnimation?: boolean;
    style?: React.CSSProperties;
  }>
> = ({ children, dataCy, ellipsisAnimation = false, style }) => {
  return (
    <div
      data-cy={dataCy}
      className={ellipsisAnimation ? classNames(ellipsis, loading) : loading}
      style={style}
    >
      <div>{children}</div>
    </div>
  );
};

export default Loading;
