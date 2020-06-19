import React, { useEffect, useRef } from "react";
import { action } from "@storybook/addon-actions";
import _ from "lodash";
import styled from "styled-components";
import { useSetRecoilState } from "recoil";

import { viewCount } from "../../state/atoms";
import { useTrackMousePosition, useTrackMain } from "../../state/hooks";

const StyledContainer = styled.div`
  width: 100%;
  height: 100%;
`;

export const Container = ({ children }) => {
  const ref = useRef();
  useTrackMousePosition();
  useTrackMain(ref);

  const setViewCount = useSetRecoilState(viewCount);
  useEffect(() => {
    setViewCount(50);
  });

  return <StyledContainer ref={ref}>{children}</StyledContainer>;
};
