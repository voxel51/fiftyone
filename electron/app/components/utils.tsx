import React, { useEffect, useRef, useLayoutEffect } from "react";
import { action } from "@storybook/addon-actions";
import _ from "lodash";
import styled from "styled-components";
import { useSetRecoilState } from "recoil";

import { viewCount, mainTop, mainSize, mainLoaded } from "../state/atoms";
import { useTrackMousePosition, useResizeObserver } from "../state/hooks";

const StyledContainer = styled.div`
  width: 100%;
  height: 100%;
`;

export const Container = ({ children }) => {
  useTrackMousePosition();
  const setMainSize = useSetRecoilState(mainSize);
  const setMainTop = useSetRecoilState(mainTop);
  const setMainLoaded = useSetRecoilState(mainLoaded);
  const [ref, { contentRect }] = useResizeObserver();

  const setViewCount = useSetRecoilState(viewCount);
  useEffect(() => {
    setViewCount(50);
  }, []);

  useLayoutEffect(() => {
    if (!contentRect) return;
    const { top, width, height } = contentRect;
    setMainSize([width, height]);
    setMainTop(top);
    setMainLoaded(true);
  }, [contentRect]);

  return <StyledContainer ref={ref}>{children}</StyledContainer>;
};
