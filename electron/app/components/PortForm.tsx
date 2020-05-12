import _ from "lodash";
import React, { useState } from "react";
import { Input, Label } from "semantic-ui-react";

import { updateState } from "../actions/update";
import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import CodeBlock from "./CodeBlock";

export default connect(function (props) {
  const { title, language, children, port, connected } = props;
  const [formState, setFormState] = useState({
    port: port,
    connect: connected,
    resolving: false,
    invalid: false,
  });
  console.log(connected);

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
      socket.on("connect", () => {
        setState({
          ...formState,
          invalid: false,
          connected: true,
          resolving: false,
        });
      });
      setTimeout(
        () =>
          setFormState({
            ...tempFormState,
            resolving: false,
            connected: false,
          }),
        500
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
