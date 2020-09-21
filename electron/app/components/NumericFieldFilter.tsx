import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { NamedRangeSlider } from "./RangeSlider";
import { getSocket } from "../utils/socket";
import { animated, useSpring } from "react-spring";
import useMeasure from "react-use-measure";

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
  const port = useRecoilValue(atoms.port);
  const socket = getSocket(port, "state");
  const boundsAtom = selectors.numericFieldBounds(entry.name);
  const rangeAtom = atoms.filterNumericFieldRange(entry.name);
  const includeNoneAtom = atoms.filterNumericFieldIncludeNone(entry.name);
  const [includeNone, setIncludeNone] = useRecoilState(includeNoneAtom);
  const stateDescription = useRecoilValue(atoms.stateDescription);
  const bounds = useRecoilValue(boundsAtom);
  const [range, setRange] = useRecoilState(rangeAtom);
  const hasBounds = bounds.every((b) => b !== null);
  const [overflow, setOverflow] = useState("hidden");
  const [localBounds, setLocalBounds] = useState([null, null]);
  const isDefaultRange = range[0] === bounds[0] && range[1] === bounds[1];
  const filterStage = useRecoilValue(selectors.filterStage(entry.name));
  useEffect(() => {
    if (filterStage) return;
    setIncludeNone(true);
    setRange(bounds);
  }, [filterStage]);
  useEffect(() => {
    if (!hasBounds) {
      return;
    }
    setLocalBounds(bounds);
    localBounds.some((b, i) => b !== bounds[i]) && setRange([...bounds]);
  }, [bounds]);

  useEffect(() => {
    const newState = JSON.parse(JSON.stringify(stateDescription));
    if (range.every((e) => e === null)) return;
    if (
      includeNone &&
      isDefaultRange &&
      !(entry.name in newState.filter_stages)
    )
      return;
    const filter = makeFilter(entry.name, range, includeNone, isDefaultRange);
    if (
      JSON.stringify(filter) ===
      JSON.stringify(newState.filter_stages[entry.name])
    )
      return;
    if (isDefaultRange && includeNone && newState.filter_stages[entry.name]) {
      delete newState.filter_stages[entry.name];
    } else {
      newState.filter_stages[entry.name] = filter;
    }
    hasBounds &&
      socket.emit(
        "update",
        {
          data: newState,
          include_self: true,
        },
        () => {}
      );
  }, [range, includeNone]);

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
