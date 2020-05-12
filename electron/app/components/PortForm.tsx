import _ from "lodash";
import React, { useState } from "react";
import { Input, Label } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import CodeBlock from "./CodeBlock";

export default connect(({ connected, port, resolving, setPort }) => {
  const [initialPort, setInitialPort] = useState(port);
  const [formState, setFormState] = useState({
    port: port,
    connected: connected,
    resolving: false,
    invalid: false,
  });

  function setPort() {
    if (formState.connected) {
      dispatch(updatePort(formState.port));
    }
  }

  const onChange = (event, input) => {
    if (isNaN(input.value)) {
      setFormState({
        ...formState,
        connected: false,
        resolving: false,
        invalid: true,
        port: input.value,
      });
      setPort(initialPort);
    } else if (parseInt(input.value) <= 65535) {
      const tempFormState = {
        ...formState,
        connected: false,
        resolving: true,
        invalid: false,
        port: input.value,
      };
      setFormState(tempFormState);
      const socket = getSocket(input.value, "state");
      setTimeout(() => {
        setFormState({
          ...tempFormState,
          resolving: false,
          connected: socket.connected,
        });
        setPort(input.value);
      }, 1000);
    } else {
      setFormState({
        ...formState,
        connected: false,
        resolving: false,
        invalid: true,
        port: input.value,
      });
      setPort(initialPort);
    }
  };

  return (
    <Input
      labelPosition="right"
      value={formState.port}
      onChange={onChange}
      loading={formState.resolving}
    >
      <input />
      <Label>
        {formState.invalid
          ? "Invalid"
          : formState.resolving
          ? "Resolving"
          : formState.connected
          ? "Connected"
          : "Not connected"}
      </Label>
    </Input>
  );
});
