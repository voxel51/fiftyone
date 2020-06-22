import React, { useState, useLayoutEffect, useRef, useEffect } from "react";
import styled from "styled-components";
import { useSpring, animated } from "react-spring";
import { useGesture } from "react-use-gesture";
import { useRecoilValue, useRecoilState, useSetRecoilState } from "recoil";

import "../../app.global.css";
import IndicatorForm from "./IndicatorForm";
import { mainSize, isDraggingIndicator, currentIndex } from "../../state/atoms";
import { indicatorIndex } from "../../state/selectors";

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
  const setCurrentIndex = useSetRecoilState(currentIndex);
  const indicatorIndexValue = useRecoilValue(indicatorIndex);
  const [isDraggingIndicatorValue, setIsDraggingIndicator] = useRecoilState(
    isDraggingIndicator
  );
  const [{ top }, set] = useSpring(() => ({ top: 35 }));

  const gestureHandler = ({ xy: [_, py], dragging }) => {
    const newTop = Math.min(mainSizeValue[1] - 19, Math.max(py, 16));
    set({ top: newTop });
  };

  const toggleDrag = (e) => {
    if (isDraggingIndicatorValue) {
      setCurrentIndex(indicatorIndexValue);
    }
    setIsDraggingIndicator(!isDraggingIndicatorValue);
  };

  const bind = useGesture(
    {
      onMove: gestureHandler,
      onDrag: gestureHandler,
      onDragStart: toggleDrag,
      onDragEnd: toggleDrag,
    },
    {
      domTarget: document.body,
    }
  );

  return (
    <Indicator
      {...bind()}
      style={{ top }}
      onDragStart={toggleDrag}
      onDragEnd={toggleDrag}
    >
      <IndicatorForm />
    </Indicator>
  );
}
