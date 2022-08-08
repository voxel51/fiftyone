import React from "react";

import { loading } from "./Loading.module.css";

const Loading: React.FC<
  React.PropsWithChildren<{ style?: React.CSSProperties }>
> = ({ children, style }) => {
  return (
    <div className={loading} style={style}>
      <div>{children}</div>
    </div>
  );
};

export default Loading;
