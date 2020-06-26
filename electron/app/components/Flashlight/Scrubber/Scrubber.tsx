import React, { useState, useLayoutEffect, useRef, useEffect } from "react";
import styled from "styled-components";
import { useSpring, useSprings, animated } from "react-spring";
import { useRecoilValue } from "recoil";

import "../../../app.global.css";
import Indicator from "./Indicator";
import { mainSize, viewCount } from "../../../state/atoms";
import { currentIndexIndicatorTop, ticks } from "../../../state/selectors";

const Scrubber = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  cursor: pointer;
`;

const ScrubberWrapper = styled.div`
  position: absolute;
  width: 3rem;
  height: 100%;
  top: 0;
  right: 0;
`;

const IndexIndicatorDiv = animated(styled.div`
  position: absolute;
  width: 2rem;
  height: 3px;
  right: 0;
  background: var(--color-secondary);
`);

const SectionTick = animated(styled.div`
  position: absolute;
  right: 0;
  width: 1rem;
  height: 3px;
  background: var(--color-tertiary);
`);

const IndexIndicator = () => {
  const currentIndexIndicatorTopValue = useRecoilValue(
    currentIndexIndicatorTop
  );
  const props = useSpring({
    top: currentIndexIndicatorTopValue,
  });

  return <IndexIndicatorDiv style={props} />;
};

export default function () {
  const ticksValue = useRecoilValue(ticks);
  const viewCountValue = useRecoilValue(viewCount);
  const [unused, mh] = useRecoilValue(mainSize);
  const springs = useSprings(
    ticksValue.length,
    ticksValue.map((s) => ({
      top: Math.max(32, (s / (viewCountValue - 1)) * (mh - 35) + 32),
    }))
  );
  return (
    <ScrubberWrapper>
      <Scrubber>
        {springs.map((props, index) => (
          <SectionTick key={index} style={props} />
        ))}
        <IndexIndicator />
        <Indicator />
      </Scrubber>
    </ScrubberWrapper>
  );
}
