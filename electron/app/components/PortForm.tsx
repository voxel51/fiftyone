import _ from "lodash";
import React, { useState } from "react";
import { Input, Label } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";

export default connect(({ connected, port, setResult }) => {
  const [initialState, setInitialState] = useState({ port, connected });
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
      setResult(initialState);
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
        setResult({ port: input.value, connected: true });
      }
    } else {
      setFormState({
        ...formState,
        connected: false,
        invalid: true,
        port: input.value,
      });
      setResult(initialState);
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
