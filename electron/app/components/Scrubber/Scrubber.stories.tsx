import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { useSpring, animated } from "react-spring";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { useScroll } from "react-use-gesture";

import { currentListTop } from "../../state/selectors";
import { currentListHeight, viewCount } from "../../state/atoms";
import { Container } from "./utils";
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
  overflow-x: hidden;
  overyflow-y: scroll;
`;

const ImageDiv = animated(styled.div`
  position: absolute;
  width: 100%;
  box-sizing: border-box;
  padding: 0 1rem;
`);

const Images = ({ targetRef, scrollRef }) => {
  const ref = useRef();
  const setCurrentListHeight = useSetRecoilState(currentListHeight);
  const currentListTopValue = useRecoilValue(currentListTop);
  const viewCountValue = useRecoilValue(viewCount);
  useEffect(() => {
    setCurrentListHeight(targetRef.current.offsetHeight);
  }, [targetRef.current]);
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

export const scrubber = () => {
  const ref = useRef();
  const scrollRef = useRef();

  return (
    <Container>
      <Grid>
        <ImagesContainer ref={scrollRef}>
          <Images targetRef={ref} scrollRef={scrollRef} />
        </ImagesContainer>
        <Scrubber targetRef={ref} />
      </Grid>
    </Container>
  );
};
