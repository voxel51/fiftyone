import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { NamedRangeSlider } from "./RangeSlider";
import { animated, useSpring } from "react-spring";
import useMeasure from "react-use-measure";

const NumericFieldFilter = ({ expanded, entry }) => {
  const boundsAtom = selectors.numericFieldBounds(entry.path);
  const rangeAtom = selectors.filterNumericFieldRange(entry.path);
  const includeNoneAtom = selectors.filterNumericFieldIncludeNone(entry.path);
  const [overflow, setOverflow] = useState("hidden");

  const [ref, { height }] = useMeasure();
  const props = useSpring({
    height: expanded ? height : 0,
    from: {
      height: 0,
    },
    onStart: () => !expanded && setOverflow("hidden"),
    onRest: () => expanded && setOverflow("visible"),
  });

  return (
    <animated.div style={{ ...props, overflow }}>
      <NamedRangeSlider
        color={entry.color}
        name={"Range"}
        valueName={"value"}
        includeNoneAtom={includeNoneAtom}
        boundsAtom={boundsAtom}
        rangeAtom={rangeAtom}
        ref={ref}
      />
    </animated.div>
  );
};

export default NumericFieldFilter;
