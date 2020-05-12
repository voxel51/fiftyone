import _ from "lodash";
import React, { useState } from "react";
import { Input } from "semantic-ui-react";

import { updateState } from "../actions/update";
import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import CodeBlock from "./CodeBlock";

export default connect(function (props) {
  const { title, language, children, port, connected } = props;

  return <Input value={port} loading={connected} />;
});
