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
} from "../../state/atoms";
import {
  itemBasePosition,
  itemBaseSize,
  itemSize,
  itemPosition,
  itemData,
  itemIsLoaded,
  itemSource,
  segmentIndexFromItemIndex,
} from "../../state/selectors";
import { getPage, getSocket } from "../../utils/socket";
import Player51 from "../../player51/build/cjs/player51.min.js";

const LoadingThumbnailDiv = animated(styled.div`
  position: absolute;
  z-index: 0;
  background: #ccc;
`);

const ThumbnailDiv = animated(styled.div`
  position: absolute;
  background: #ccc;
`);

const Img = animated(styled.img`
  width: 100%;
  height: 100%;
  z-index: 1000;
`);

const Thumbnail = ({ index }) => {
  const setCurrent = useSetRecoilState(current(index));
  const idd = useRecoilValue(itemData(index));
  const itemSizeValue = useRecoilValue(itemSize(index));
  const mainLoadedValue = useRecoilValue(mainLoaded);
  const itemBasePositionValue = useRecoilValue(itemBasePosition(index));
  const isMainWidthResizingValue = useRecoilValue(isMainWidthResizing);
  const itemBaseSizeValue = useRecoilValue(itemBaseSize);
  const itemPositionValue = useRecoilValue(itemPosition(index));
  const segmentIndexValue = useRecoilValue(segmentIndexFromItemIndex(index));
  const setSegmentIsLoaded = useSetRecoilState(
    segmentIsLoaded(segmentIndexValue)
  );
  const on = !isMainWidthResizingValue;
  const itemSourceValue = useRecoilValue(itemSource(index));

  const positionRef = useRef();
  const position = useSpring({
    ...itemPositionValue,
    ...itemSizeValue,
    from: {
      ...itemBasePositionValue,
      ...itemBaseSizeValue,
    },
    ref: positionRef,
  });

  useEffect(() => {
    setCurrent(idd);
  }, [idd]);

  const showRef = useRef();
  const show = useTransition(on, null, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    ref: showRef,
  });

  useChain(on ? [positionRef, showRef] : [showRef, positionRef], [0.2, 0.8]);

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

const LoadingThumbnail = ({ index, unveil, move }) => {
  const itemIsLoadedValue = useRecoilValue(itemIsLoaded(index));
  const cv = useRecoilValue(current(index));
  const itemBasePositionValue = useRecoilValue(itemBasePosition(index));
  const [initialLoad, setInitialLoad] = useState(true);

  const itemBaseSizeValue = useRecoilValue(itemBaseSize);

  const base = {
    ...itemBasePositionValue,
    ...itemBaseSizeValue,
  };

  const from =
    cv && !move && !initialLoad
      ? { width: cv.width, height: cv.height, top: cv.top, left: cv.left }
      : {
          ...itemBasePositionValue,
          ...itemBaseSizeValue,
        };

  const props = useSpring({
    opacity: 1,
    ...base,
    from: {
      opacity: cv || !unveil ? 1 : 0,
      ...from,
    },
  });

  useEffect(() => {
    setInitialLoad(false);
  }, []);

  return <LoadingThumbnailDiv style={{ ...props }} />;
};

const ThumbnailContainer = ({ index }) => {
  const isMainWidthResizingValue = useRecoilValue(isMainWidthResizing);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    setInitialLoad(false);
  }, []);

  if (isMainWidthResizingValue)
    return <LoadingThumbnail index={index} unveil={initialLoad} move={true} />;

  return (
    <Suspense
      fallback={<LoadingThumbnail index={index} unveil={false} move={false} />}
    >
      <Thumbnail index={index} />
    </Suspense>
  );
};

export default ({ index }) => {
  return <ThumbnailContainer index={index} />;
};
