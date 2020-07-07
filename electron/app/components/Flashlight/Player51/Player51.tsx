import styled from "styled-components";
import React, { useRef, useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import {
  animated,
  interpolate,
  useSpring,
  useChain,
  useTransition,
} from "react-spring";

import { itemRowCache } from "../../../state/atoms";
import {
  itemSource,
  itemAdjustedLayout,
  itemRowIndices,
} from "../../../state/selectors";
// import Player51 from "../../player51/build/cjs/player51.min.js";

const ThumbnailDiv = animated(styled.div`
  position: absolute;
  background: #ccc;
  transition: none 0s ease 0s;
  top: 0;
  left: 0;
  display: block;
  contain: strict;
`);

const Img = animated(styled.div`
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  bottom: 0;
  left: 0;
  right: 0;
  top: 0;
  transition: transform 0.135s cubic-bezier(0, 0, 0.2, 1), opacity linear 0.15s;
`);

const Thumbnail = React.memo(({ index }) => {
  return null;

  const position = useSpring({
    width,
    height,
    transform: `translate3d(${left}px,${top}px,0)`,
    config: {
      duration: 0,
    },
  });
  return <ThumbnailDiv style={position}>{index}</ThumbnailDiv>;
});

export default ({ index }) => <Thumbnail index={index} />;
