import React from "react";

import { loading } from "./Loading.module.css";

const Loading: React.FC = ({ children }) => {
  return (
    <div className={loading}>
      <div>{children}</div>
    </div>
  );
};

export default Loading;
