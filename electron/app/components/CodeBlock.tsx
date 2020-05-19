import React, { useState } from "react";
import { Divider, Header } from "semantic-ui-react";
import Highlight from "react-highlight.js";

import { updateState } from "../actions/update";
import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

export default connect(function (props) {
  const { language, children } = props;

  return <Highlight class={language}>{children}</Highlight>;
});
