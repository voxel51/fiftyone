import React, { useState, useLayoutEffect, useRef, useEffect } from "react";
import styled from "styled-components";
import { useSpring, animated } from "react-spring";
import { useMove } from "react-use-gesture";
import { useRecoilValue } from "recoil";

import "../../app.global.css";
import IndicatorForm from "./IndicatorForm";
import { mainSize } from "../../state/atoms";

const Indicator = styled(animated.div)`
  width: 3rem;
  border-bottom: 3px solid var(--color-primary);
  position: absolute;
  margin-top: -16px;
  right: 0;
  cursor: pointer;
  background: var(--mostly-transparent);
`;

export default function () {
  const mainSizeValue = useRecoilValue(mainSize);
  const [{ top }, set] = useSpring(() => ({ top: 35 }));

  const bind = useMove(
    ({ xy: [_, py], dragging }) => {
      const newTop = Math.min(mainSizeValue[1] - 19, Math.max(py, 16));
      set({ top: newTop });
    },
    {
      domTarget: document.body,
    }
  );

  return (
    <Indicator {...bind()} style={{ top }}>
      <IndicatorForm />
    </Indicator>
  );
}
