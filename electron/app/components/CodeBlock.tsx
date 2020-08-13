import React from "react";
import Highlight from "react-highlight.js";

import connect from "../utils/connect";

export default connect(function (props) {
  const { language, children } = props;

  return <Highlight class={language}>{children}</Highlight>;
});
