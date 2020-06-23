import React, { useState, useLayoutEffect, useRef, useEffect } from "react";
import styled from "styled-components";
import { useSpring, animated } from "react-spring";
import { useGesture } from "react-use-gesture";
import { useRecoilValue, useRecoilState, useSetRecoilState } from "recoil";

import "../../app.global.css";
import IndicatorForm from "./IndicatorForm";
import { mainSize, isDraggingIndicator } from "../../state/atoms";
import { indicatorIndex, currentIndex } from "../../state/selectors";

const Indicator = styled(animated.div)`
  width: 3rem;
  border-bottom: 3px solid var(--color-primary);
  position: absolute;
  right: 0;
  cursor: pointer;
  background: var(--mostly-transparent);
`;

export default function () {
  const ref = useRef();
  const mainSizeValue = useRecoilValue(mainSize);
  const setCurrentIndex = useSetRecoilState(currentIndex);
  const indicatorIndexValue = useRecoilValue(indicatorIndex);
  const [isDraggingIndicatorValue, setIsDraggingIndicator] = useRecoilState(
    isDraggingIndicator
  );
  const [{ top }, set] = useSpring(() => ({ top: 0 }));

  const gestureHandler = ({ xy: [_, py], dragging }) => {
    const newTop = Math.min(mainSizeValue[1] - 35, Math.max(py - 16, 0));
    set({ top: newTop });
  };

  const toggleDrag = (e) => {
    setIsDraggingIndicator(!isDraggingIndicatorValue);
  };

  const onDrag = () => {
    setCurrentIndex(indicatorIndexValue);
  };

  const bindMove = useGesture(
    {
      onMove: gestureHandler,
    },
    {
      domTarget: document.body,
    }
  );

  const bindDrag = useGesture(
    {
      onDragStart: toggleDrag,
      onDragEnd: toggleDrag,
      onDrag: onDrag,
    },
    {
      domTarget: ref.current,
    }
  );

  return (
    <Indicator {...bindMove()} {...bindDrag()} style={{ top }} ref={ref}>
      <IndicatorForm />
    </Indicator>
  );
}
