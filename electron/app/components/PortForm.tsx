import _ from "lodash";
import React, { useState } from "react";
import { Input, Label } from "semantic-ui-react";

import { updateState } from "../actions/update";
import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import CodeBlock from "./CodeBlock";

export default connect(function (props) {
  const { title, language, children, port, connected, onClose } = props;
  const [formState, setFormState] = useState({
    port: port,
    connected: connected,
    resolving: false,
    invalid: false,
  });

  const onChange = (event, input) => {
    if (isNaN(input.value)) {
      setFormState({
        ...formState,
        connected: false,
        resolving: false,
        invalid: true,
        port: input.value,
      });
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
      setTimeout(
        () =>
          setFormState({
            ...tempFormState,
            resolving: false,
            connected: socket.connected,
          }),
        1000
      );
    } else {
      setFormState({
        ...formState,
        connected: false,
        resolving: false,
        invalid: true,
        port: input.value,
      });
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
