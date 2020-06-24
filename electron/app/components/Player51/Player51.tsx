import _ from "lodash";
import styled from "styled-components";
import React, { Suspense, useState, useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { useSpring, animated } from "react-spring";

import { mainLoaded, segmentIsLoaded } from "../../state/atoms";
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
  background: #cccccc;
  position: absolute;
`);

const ThumbnailParent = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
`;

const ThumbnailDiv = animated(styled.div`
  position: absolute;
  opacity: 0;
`);

const Img = animated(styled.img`
  width: 100%;
  height: 100%;
`);

const Thumbnail = ({ index }) => {
  const itemSizeValue = useRecoilValue(itemSize(index));
  const itemAdjustedPositionValue = useRecoilValue(itemAdjustedPosition(index));
  const segmentIndexValue = useRecoilValue(segmentIndexFromItemIndex(index));
  const setSegmentIsLoaded = useSetRecoilState(
    segmentIsLoaded(segmentIndexValue)
  );
  const itemSourceValue = useRecoilValue(itemSource(index));

  useEffect(() => setSegmentIsLoaded(true), []);

  const props = useSpring({
    ...itemAdjustedPositionValue,
    ...itemSizeValue,
    opacity: 1,
    from: {
      opacity: 0,
      top: 0,
      left: 0,
    },
  });
  return (
    <ThumbnailParent>
      <ThumbnailDiv style={props}>
        <Img src={itemSourceValue} />
      </ThumbnailDiv>
    </ThumbnailParent>
  );
};

const ThumbnailContainer = ({ index }) => {
  const itemBasePositionValue = useRecoilValue(itemBasePosition(index));
  const itemBaseSizeValue = useRecoilValue(itemBaseSize);

  const props = useSpring({
    ...itemBasePositionValue,
    ...itemBaseSizeValue,
    opacity: 1,
    from: {
      opacity: 0,
    },
  });

  return (
    <Tile style={props}>
      <Suspense fallback={<></>}>
        <Thumbnail index={index} />
      </Suspense>
    </Tile>
  );
};

export default ({ index }) => {
  const mainLoadedValue = useRecoilValue(mainLoaded);
  if (!mainLoadedValue) return null;

  return <ThumbnailContainer index={index} />;
};
