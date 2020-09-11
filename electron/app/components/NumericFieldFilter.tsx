import React, { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { NamedRangeSlider } from "./RangeSlider";
import { getSocket } from "../utils/socket";

const makeFilter = (fieldName, range, includeNone) => {
  let expr,
    rangeExpr = null;
  let fieldStr = `$${fieldName}`;
  if (range) {
    rangeExpr = {
      $and: [{ $gte: [fieldStr, range[0]] }, { $lte: [fieldStr, range[1]] }],
    };
  }
  if (includeNone) {
    expr = { $or: [rangeExpr, { $eq: [fieldStr, null] }] };
  }
  return {
    kwargs: [["filter", { $expr: expr }]],
    _cls: "fiftyone.core.stages.Match",
  };
};

const NumericFieldFilter = ({ entry }) => {
  const port = useRecoilValue(atoms.port);
  const socket = getSocket(port, "state");
  const boundsAtom = selectors.numericFieldBounds(entry.name);
  const rangeAtom = atoms.filterNumericFieldRange(entry.name);
  const includeNoneAtom = atoms.filterNumericFieldIncludeNone(entry.name);
  const includeNone = useRecoilValue(includeNoneAtom);
  const stateDescription = useRecoilValue(atoms.stateDescription);
  const bounds = useRecoilValue(boundsAtom);
  const [range, setRange] = useRecoilState(rangeAtom);
  const hasBounds = bounds.every((b) => b !== null);
  const isDefaultRange = range[0] === bounds[0] && range[1] === bounds[1];
  console.log(bounds);
  useEffect(() => {
    hasBounds && range.every((r) => r === null) && setRange([...bounds]);
  }, [bounds]);

  useEffect(() => {
    const newState = JSON.parse(JSON.stringify(stateDescription));
    if (range.every((e) => e === null)) return;
    if (isDefaultRange && !(entry.name in newState.filter_stages)) return;
    const filter = makeFilter(entry.name, range, includeNone);
    if (
      JSON.stringify(filter) ===
      JSON.stringify(newState.filter_stages[entry.name])
    )
      return;
    if (isDefaultRange && newState.filter_stages[entry.name]) {
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
  }, [range, bounds, includeNone]);

  return (
    <NamedRangeSlider
      color={entry.color}
      name={"Range"}
      valueName={"value"}
      includeNoneAtom={includeNoneAtom}
      boundsAtom={boundsAtom}
      rangeAtom={rangeAtom}
    />
  );
};

export default NumericFieldFilter;
