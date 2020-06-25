import _ from "lodash";
import styled from "styled-components";
import React, { Suspense, useState, useEffect, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { useSpring, animated, useChain, useTransition } from "react-spring";

import {
  mainLoaded,
  segmentIsLoaded,
  isMainWidthResizing,
} from "../../state/atoms";
import {
  itemBasePosition,
  itemBaseSize,
  itemSize,
  itemAdjustedPosition,
  itemData,
  itemIsLoaded,
  itemSource,
  segmentIndexFromItemIndex,
} from "../../state/selectors";
import { getPage, getSocket } from "../../utils/socket";
import Player51 from "../../player51/build/cjs/player51.min.js";

const Tile = animated(styled.div`
  position: absolute;
  z-index: 0;
`);

const ThumbnailParent = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
`;

const ThumbnailDiv = animated(styled.div`
  position: absolute;
  background: #ccc;
`);

const Img = animated(styled.img`
  width: 100%;
  height: 100%;
  z-index: 10000;
`);

const Thumbnail = ({ index }) => {
  const itemSizeValue = useRecoilValue(itemSize(index));
  const isMainWidthResizingValue = useRecoilValue(isMainWidthResizing);
  const itemBaseSizeValue = useRecoilValue(itemBaseSize);
  const itemAdjustedPositionValue = useRecoilValue(itemAdjustedPosition(index));
  const segmentIndexValue = useRecoilValue(segmentIndexFromItemIndex(index));
  const setSegmentIsLoaded = useSetRecoilState(
    segmentIsLoaded(segmentIndexValue)
  );
  const on = !isMainWidthResizingValue;
  const itemSourceValue = useRecoilValue(itemSource(index));

  const positionRef = useRef();
  const position = useSpring({
    ...itemAdjustedPositionValue,
    ...itemSizeValue,
    from: {
      top: 0,
      left: 0,
      ...itemBaseSizeValue,
    },
    ref: positionRef,
  });

  const showRef = useRef();
  const show = useTransition(on, null, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    ref: showRef,
  });

  useChain(on ? [positionRef, showRef] : [showRef, positionRef], [
    0,
    on ? 0.5 : 0.1,
  ]);

  useEffect(() => setSegmentIsLoaded(true), []);

  return (
    <ThumbnailParent>
      <ThumbnailDiv style={position}>
        {show.map(
          ({ item, key, props }) =>
            item && <Img key={key} src={itemSourceValue} style={props} />
        )}
      </ThumbnailDiv>
    </ThumbnailParent>
  );
};

const ThumbnailContainer = ({ index }) => {
  const itemBasePositionValue = useRecoilValue(itemBasePosition(index));
  const itemBaseSizeValue = useRecoilValue(itemBaseSize);
  const mainLoadedValue = useRecoilValue(mainLoaded);
  const itemIsLoadedValue = useRecoilValue(itemIsLoaded(index));

  const props = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  const hide = useSpring({
    background: itemIsLoadedValue ? "rgba(0, 0, 0, 0)" : "#ccc",
  });

  return (
    <Tile
      style={{
        ...props,
        ...hide,
        ...itemBasePositionValue,
        ...itemBaseSizeValue,
      }}
    >
      <Suspense fallback={<></>}>
        <Thumbnail index={index} />
      </Suspense>
    </Tile>
  );
};

export default ({ index }) => {
  return <ThumbnailContainer index={index} />;
};
