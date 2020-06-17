import React from "react";
import styled from "styled-components";
import { useMachine } from "@xstate/react";

import "../../app.global.css";
import indicatorFormMachine from "./IndicatorForm.machine.ts";

const IndicatorForm = styled.input`
  width: 100%;
  max-width: 3rem;
  height: 2rem;
  border: none;
  padding: 0;

  &:focus {
    outline: none;
    padding: 0;
  }
`;

export default function () {
  const [state, send] = useMachine(indicatorFormMachine);
  const { value } = state.context;
  return <IndicatorForm value={value} />;
}
