import React, { useState } from "react";

import * as selectors from "../../recoil/selectors";
import StringFilter from "./StringFilter";
import { animated, useSpring } from "react-spring";
import useMeasure from "react-use-measure";

const StringFieldFilter = ({ expanded, entry }) => {
  const valuesAtom = selectors.stringFieldValues(entry.path);
  const selectedValuesAtom = selectors.filterStringFieldValues(entry.path);
  const includeNoneAtom = selectors.filterStringFieldIncludeNone(entry.path);
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
      <StringFilter
        name={"Values"}
        valueName={"value"}
        selectedValuesAtom={selectedValuesAtom}
        valuesAtom={valuesAtom}
        ref={ref}
      />
    </animated.div>
  );
};

export default StringFieldFilter;
