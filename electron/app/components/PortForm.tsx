import _ from "lodash";
import React, { useState } from "react";
import { Input, Label } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import CodeBlock from "./CodeBlock";

export default connect(({ connected, port, setPort }) => {
  const [initialPort, setInitialPort] = useState(port);
  const [formState, setFormState] = useState({
    port: port,
    connected: connected,
    invalid: false,
  });

  const onChange = (event, input) => {
    if (isNaN(input.value)) {
      setFormState({
        ...formState,
        connected: false,
        invalid: true,
        port: input.value,
      });
      setPort(initialPort);
    } else if (parseInt(input.value) <= 65535) {
      const socket = getSocket(input.value, "state");
      const tempFormState = {
        ...formState,
        connected: socket.connected,
        invalid: false,
        port: input.value,
      };
      setFormState(tempFormState);
      if (socket.connected) {
        setPort(input.value);
      }
    } else {
      setFormState({
        ...formState,
        connected: false,
        invalid: true,
        port: input.value,
      });
      setPort(initialPort);
    }
  };

  return (
    <Input labelPosition="right" value={formState.port} onChange={onChange}>
      <input />
      <Label>
        {formState.invalid
          ? "Invalid"
          : formState.connected
          ? "Connected!"
          : "Not connected"}
      </Label>
    </Input>
  );
});
