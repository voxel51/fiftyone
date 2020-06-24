import _ from "lodash";
import styled from "styled-components";
import React, { Suspense, useState, useEffect } from "react";
import { useRecoilValue } from "recoil";
import { useSpring, animated } from "react-spring";

import { mainLoaded } from "../../state/atoms";
import {
  itemBasePosition,
  itemBaseSize,
  itemData,
} from "../../state/selectors";

import Player51 from "../../player51/build/cjs/player51.min.js";

const Tile = animated(styled.div`
  background: #cccccc;
  position: absolute;
`);

const Thumbnail = ({ index }) => {
  const itemDataValue = useRecoilValue(itemData(index));
  console.log(itemDataValue);
  return null;
};

const ThumbnailContainer = ({ index }) => {
  const itemBasePositionValue = useRecoilValue(itemBasePosition(index));
  const itemBaseSizeValue = useRecoilValue(itemBaseSize);
  const mainLoadedValue = useRecoilValue(mainLoaded);

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
