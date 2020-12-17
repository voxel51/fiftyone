import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { NamedRangeSlider } from "./RangeSlider";
import { animated, useSpring } from "react-spring";
import useMeasure from "react-use-measure";
import { packageMessage } from "../utils/socket";

const makeFilter = (fieldName, range, includeNone, isDefaultRange) => {
  let expr,
    rangeExpr = null;
  let fieldStr = `$${fieldName}`;
  if (!isDefaultRange) {
    rangeExpr = {
      $and: [{ $gte: [fieldStr, range[0]] }, { $lte: [fieldStr, range[1]] }],
    };
  }
  if (!includeNone && isDefaultRange) {
    expr = { [fieldName]: { $exists: true, $ne: null } };
  } else if (includeNone && !isDefaultRange) {
    expr = {
      $expr: {
        $or: [rangeExpr, { $eq: [{ $ifNull: [fieldStr, null] }, null] }],
      },
    };
  } else {
    expr = { $expr: rangeExpr };
  }
  return {
    kwargs: [["filter", expr]],
    _cls: "fiftyone.core.stages.Match",
  };
};

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
