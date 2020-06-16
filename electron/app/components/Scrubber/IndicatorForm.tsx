import React from "react";
import styled from "styled-components";
import { useMachine } from "@xstate/react";

import "../../app.global.css";
import indicatorFormMachine from "./IndicatorForm.machine.ts";

const IndicatorForm = styled.input`
  width: 100%;
  height: 100%;
  right: 0;
`;

export default function () {
  const [state, send] = useMachine(indicatorFormMachine);

  return <IndicatorForm>1000</IndicatorForm>;
}
