import React, { useState, useLayoutEffect, useRef, useEffect } from "react";
import styled from "styled-components";
import { useSpring, animated } from "react-spring";
import { useMove } from "react-use-gesture";

import { useMachine } from "@xstate/react";

import "../../app.global.css";
import IndicatorForm from "./IndicatorForm";
import indicatorMachine from "./Indicator.machine.ts";

const Indicator = styled(animated.div)`
  width: 3rem;
  border-bottom: 3px solid var(--color-primary);
  position: absolute;
  margin-top: -16px;
  right: 0;
`;

export default function () {
  const targetRef = useRef();
  const [height, setHeight] = useState(null);
  const [{ top }, set] = useSpring(() => ({ top: 0 }));

  const bind = useMove(
    ({ xy: [px, py], dragging }) => {
      set({ top: py });
    },
    {
      domTarget: document.body,
      bounds: {
        top: 16,
        bottom: height,
      },
    },
    [height]
  );

  useEffect(() => {
    if (targetRef.current) {
      setHeight(targetRef.current.parentNode.offsetHeight);
    }
  }, [targetRef]);

  return (
    <Indicator {...bind()} style={{ top }} ref={targetRef}>
      <IndicatorForm />
    </Indicator>
  );
}
