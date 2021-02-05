import React, { useContext, useState } from "react";
import { useRecoilState } from "recoil";
import { animated, useSpring } from "react-spring";
import useMeasure from "react-use-measure";
import styled from "styled-components";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { SampleContext } from "../utils/context";
import { NamedRangeSlider } from "./RangeSlider";
import StringFilter from "./StringFilter";
import { CONFIDENCE_LABELS } from "../utils/labels";
import { removeObjectIDsFromSelection } from "../utils/selection";

const FilterHeader = styled.div`
  display: flex;
  justify-content: space-between;

  a {
    cursor: pointer;
    text-decoration: underline;
  }
`;

const HiddenObjectFilter = ({ entry }) => {
  const fieldName = entry.name;
  const sample = useContext(SampleContext);
  const [hiddenObjects, setHiddenObjects] = useRecoilState(atoms.hiddenObjects);
  if (!sample) {
    return null;
  }

  const sampleHiddenObjectIDs = Object.entries(hiddenObjects)
    .filter(
      ([object_id, data]) =>
        data.sample_id === sample._id && data.field === fieldName
    )
    .map(([object_id]) => object_id);
  if (!sampleHiddenObjectIDs.length) {
    return null;
  }
  const clear = () =>
    setHiddenObjects((hiddenObjects) =>
      removeObjectIDsFromSelection(hiddenObjects, sampleHiddenObjectIDs)
    );

  return (
    <FilterHeader>
      Manually hidden: {sampleHiddenObjectIDs.length}
      <a onClick={clear}>reset</a>
    </FilterHeader>
  );
};

const Filter = React.memo(({ expanded, style, entry, ...rest }) => {
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
  console.log(rest);

  return (
    <animated.div style={{ ...props, overflow }}>
      <div ref={ref}>
        <div style={{ margin: 3 }}>
          <StringFilter
            valuesAtom={selectors.labelClasses(entry.path)}
            selectedValuesAtom={rest.includeLabels(entry.path)}
          />
          <HiddenObjectFilter entry={entry} />
          {CONFIDENCE_LABELS.includes(entry.type) && (
            <NamedRangeSlider
              color={entry.color}
              name={"Confidence"}
              valueName={"confidence"}
              includeNoneAtom={rest.includeNoConfidence(entry.path)}
              boundsAtom={rest.confidenceBounds(entry.path)}
              rangeAtom={rest.confidenceRange(entry.path)}
              maxMin={0}
              minMax={1}
            />
          )}
        </div>
      </div>
    </animated.div>
  );
});

export default Filter;
