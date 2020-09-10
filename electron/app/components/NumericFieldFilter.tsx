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
      $and: [{ $gt: [fieldStr, range[0]] }, { $lt: [fieldStr, range[1]] }],
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
  const [stateDescription, setStateDescription] = useRecoilState(
    atoms.stateDescription
  );
  const bounds = useRecoilValue(boundsAtom);
  const [range, setRange] = useRecoilState(rangeAtom);
  const hasBounds = bounds.every((b) => b !== null);
  const isDefaultRange = range[0] === bounds[0] && range[1] === bounds[1];
  useEffect(() => {
    hasBounds && range.every((r) => r === null) && setRange([...bounds]);
  }, [bounds]);

  useEffect(() => {
    const newState = JSON.parse(JSON.stringify(stateDescription));
    if (isDefaultRange && newState.filter_stages[entry.name]) {
      delete newState.filter_stages[entry.name];
    } else {
      newState.filter_stages[entry.name] = makeFilter(
        entry.name,
        range,
        includeNone
      );
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
