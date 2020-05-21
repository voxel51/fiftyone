import React, { useState } from "react";
import { Dimmer, Loader, Container, Label } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

const Labels = (props) => {
  return <span>...</span>;
};

export default connect(Labels);
