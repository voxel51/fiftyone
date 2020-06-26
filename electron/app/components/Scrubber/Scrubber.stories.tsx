import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { useSpring, animated } from "react-spring";
import {
  RecoilRoot,
  useRecoilValue,
  useSetRecoilState,
  useRecoilState,
} from "recoil";
import { useWheel } from "react-use-gesture";

import {
  currentListTop,
  currentListHeight,
  viewCount,
  isMainWidthResizing,
} from "../../state/atoms";
import { currentListTopRange } from "../../state/selectors";
import { Container } from "../utils";
import Scrubber from "./Scrubber";

export default {
  component: Scrubber,
  title: "Scrubber",
};

const SRC =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Penobscot_Bay_panorama.jpg/800px-Penobscot_Bay_panorama.jpg";

const Grid = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 3rem;
`;

const Image = styled.img`
  width: 100%;
  margin-bottom: 1rem;
`;

const ImagesContainer = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
`;

const ImageDiv = animated(styled.div`
  position: absolute;
  width: 100%;
  box-sizing: border-box;
  padding: 0 1rem;
`);

const Images = ({ targetRef }) => {
  const setCurrentListHeight = useSetRecoilState(currentListHeight);
  const isMainWidthResizingValue = useRecoilValue(isMainWidthResizing);
  const currentListTopValue = useRecoilValue(currentListTop);
  const viewCountValue = useRecoilValue(viewCount);
  useEffect(() => {
    setCurrentListHeight(targetRef.current.offsetHeight);
  }, [targetRef.current, isMainWidthResizingValue]);

  const props = useSpring({
    top: -1 * currentListTopValue,
  });

  return (
    <ImageDiv ref={targetRef} style={props}>
      {[...Array(viewCountValue).keys()].map((i) => (
        <Image key={i} src={SRC} />
      ))}
    </ImageDiv>
  );
};

const ScrubberDemo = () => {
  const [currentListTopValue, setCurrentListTop] = useRecoilState(
    currentListTop
  );
  const [minTop, maxTop] = useRecoilValue(currentListTopRange);

  const ref = useRef();
  const containerRef = useRef();
  const bind = useWheel((s) => {
    const {
      delta: [_, y],
    } = s;
    setCurrentListTop(
      Math.min(Math.max(currentListTopValue + y, minTop), maxTop)
    );
  });

  return (
    <Container>
      <Grid>
        <ImagesContainer {...bind()} ref={containerRef}>
          <Images targetRef={ref} containerRef={containerRef} />
        </ImagesContainer>
        <Scrubber targetRef={ref} />
      </Grid>
    </Container>
  );
};

export const scrubber = () => {
  return (
    <RecoilRoot>
      <ScrubberDemo key={1} />
    </RecoilRoot>
  );
};
