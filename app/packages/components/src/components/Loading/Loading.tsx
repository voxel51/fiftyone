import React from "react";

import style from "./Loading.module.css";

const Loading: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  return (
    <div className={style.loading}>
      <div>{children}</div>
    </div>
  );
};

export default Loading;
