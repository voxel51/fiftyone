import React from "react";
import styled from "styled-components";
import { useMachine } from "@xstate/react";

import "../../app.global.css";
import indicatorFormMachine from "./IndicatorForm.machine.ts";

const IndicatorForm = styled.input`
  width: 100%;
  height: 100%;
  max-width: 3rem;
  max-height: 2rem;
  border: none;

  :focus ;
`;

export default function () {
  const [state, send] = useMachine(indicatorFormMachine);
  const { value } = state.context;
  return <IndicatorForm sendvalue={value} />;
}
