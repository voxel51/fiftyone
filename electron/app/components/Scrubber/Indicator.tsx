import React from "react";
import styled from "styled-components";
import { useSpring, animated } from "react-spring";
import { useDrag } from "react-use-gesture";

import { useMachine } from "@xstate/react";

import "../../app.global.css";
import indicatorMachine from "./Indicator.machine.ts";

const Indicator = styled(animated.div)`
  width: 3rem;
  border-bottom: 3px solid var(--color-primary);
  position: absolute;
  right: 0;
`;

export default function () {
  const [{ top }, set] = useSpring(() => ({ top: 0 }));

  // Set the drag hook and define component movement based on gesture data
  const bind = useDrag(({ down, movement: [_, my] }) => {
    set({ top: down ? my : 0 });
  });

  return (
    <Indicator {...bind()} style={{ top }}>
      1000
    </Indicator>
  );
}
