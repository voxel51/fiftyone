import styled from "styled-components";
import React, { useRef, useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { useSpring, animated, useChain, useTransition } from "react-spring";

import { itemRowCache } from "../../../state/atoms";
import {
  itemSource,
  itemAdjustedLayout,
  itemRowIndices,
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
  const itemAdjustedLayoutValue = useRecoilValue(itemAdjustedLayout(index));
  const itemSourceValue = useRecoilValue(itemSource(index));
  const itemRowIndicesValue = useRecoilValue(itemRowIndices(index));
  const setItemRowCache = useSetRecoilState(itemRowCache(index));

  useEffect(() => {
    setItemRowCache(itemRowIndicesValue);
  }, [itemSourceValue]);

  const positionRef = useRef();
  const position = useSpring({
    ...itemAdjustedLayoutValue,
    from: {
      ...itemAdjustedLayoutValue,
    },
    ref: positionRef,
    config: {
      duration: 0,
    },
  });

  const showRef = useRef();
  const show = useTransition(true, null, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    ref: showRef,
    config: {
      duration: 100,
    },
  });

  useChain(true ? [positionRef, showRef] : [showRef, positionRef], [1, 0.8]);

  return (
    <ThumbnailDiv style={position}>
      {show.map(
        ({ item, key, props }) =>
          item && <Img key={key} src={itemSourceValue} style={props} />
      )}
    </ThumbnailDiv>
  );
};

export default ({ index }) => <Thumbnail index={index} />;
