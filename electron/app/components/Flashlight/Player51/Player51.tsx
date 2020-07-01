import _ from "lodash";
import styled from "styled-components";
import React, { Suspense, useState, useEffect, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { useSpring, animated, useChain, useTransition } from "react-spring";

import {
  mainLoaded,
  segmentIsLoaded,
  isMainWidthResizing,
  current,
} from "../../../state/atoms";
import {
  itemSize,
  itemPosition,
  itemData,
  itemIsLoaded,
  itemSource,
  segmentIndexFromItemIndex,
  currentIndex,
  itemLayout,
} from "../../../state/selectors";
// import Player51 from "../../player51/build/cjs/player51.min.js";

const LoadingThumbnailDiv = animated(styled.div`
  position: absolute;
  z-index: 0;
  background: #ccc;
  contain: strict;
  will-change: transform;
`);

const ThumbnailDiv = animated(styled.div`
  position: absolute;
  background: #ccc;
  will-change: transform;
`);

const Img = animated(styled.img`
  width: 100%;
  height: 100%;
  z-index: 1000;
`);

const Thumbnail = ({ index }) => {
  const segmentIndexValue = useRecoilValue(segmentIndexFromItemIndex(index));
  const setSegmentIsLoaded = useSetRecoilState(
    segmentIsLoaded(segmentIndexValue)
  );
  const itemLayoutValue = useRecoilValue(itemLayout(index));
  const itemSourceValue = useRecoilValue(itemSource(index));

  const positionRef = useRef();
  const position = useSpring({
    ...itemLayoutValue,
    from: {
      ...itemLayoutValue,
    },
    ref: positionRef,
  });

  const showRef = useRef();
  const show = useTransition(true, null, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    ref: showRef,
  });

  useChain(true ? [positionRef, showRef] : [showRef, positionRef], [1, 0.8]);

  useEffect(() => setSegmentIsLoaded(true), []);

  return (
    <ThumbnailDiv style={position}>
      {show.map(
        ({ item, key, props }) =>
          item && <Img key={key} src={itemSourceValue} style={props} />
      )}
    </ThumbnailDiv>
  );
};

const LoadingThumbnail = ({ index }) => {
  const ci = useRecoilValue(currentIndex);
  const itemLayoutValue = useRecoilValue(itemLayout(index));

  const props = useSpring({
    opacity: 1,
    ...itemLayoutValue,
    background: ci === index ? "#000" : "#ccc",
  });

  return <LoadingThumbnailDiv style={{ ...props }} />;
};

const ThumbnailContainer = ({ index }) => {
  return (
    <Suspense fallback={<LoadingThumbnail index={index} />}>
      <Thumbnail index={index} />
    </Suspense>
  );
};

export default ({ index }) => {
  return <ThumbnailContainer index={index} />;
};
