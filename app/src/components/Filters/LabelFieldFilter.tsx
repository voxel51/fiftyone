import React, { useContext } from "react";
import { useRecoilState } from "recoil";
import { animated } from "react-spring";
import styled from "styled-components";

import { hasNoneField, useExpand } from "./utils";
import { SampleContext } from "../../utils/context";
import { NamedRangeSlider } from "./RangeSlider";
import { NamedStringFilter } from "./StringFilter";
import { CONFIDENCE_LABELS } from "../../utils/labels";
import { removeObjectIDsFromSelection } from "../../utils/selection";
import { getPathExtension } from "./LabelFieldFilters.state";
import * as atoms from "../../recoil/atoms";
import * as numericField from "./NumericFieldFilter";
import * as stringField from "./StringFieldFilter";

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

type Props = {
  expanded: boolean;
  modal: boolean;
  entry: {
    path: string;
    name: string;
    color: string;
    type: string;
  };
};

const LabelFilter = ({ expanded, entry, modal }: Props) => {
  const [ref, props] = useExpand(expanded);
  const path = `${entry.path}${getPathExtension(entry.type)}`;
  const cPath = `${path}.confidence`;
  const lPath = `${path}.label`;

  const selectedLabels = modal
    ? stringField.selectedValuesModalAtom
    : stringField.selectedValuesAtom;

  const [confidenceRange, noConfidence] = modal
    ? [numericField.rangeModalAtom, numericField.noneModalAtom]
    : [numericField.rangeAtom, numericField.noneAtom];

  return (
    <animated.div style={{ ...props }}>
      <div ref={ref}>
        <div style={{ margin: 3 }}>
          <NamedStringFilter
            color={entry.color}
            name={"Labels"}
            valueName={"label"}
            valuesAtom={stringField.valuesAtom(lPath)}
            selectedValuesAtom={selectedLabels(lPath)}
          />
          <HiddenObjectFilter entry={entry} />
          {CONFIDENCE_LABELS.includes(entry.type) && (
            <NamedRangeSlider
              color={entry.color}
              name={"Confidence"}
              valueName={"confidence"}
              noneAtom={noConfidence(cPath)}
              hasNoneAtom={hasNoneField(cPath)}
              boundsAtom={numericField.boundsAtom({
                path: cPath,
                defaultRange: [0, 1],
              })}
              rangeAtom={confidenceRange({ path: cPath, defaultRange: [0, 1] })}
            />
          )}
        </div>
      </div>
    </animated.div>
  );
};

export default React.memo(LabelFilter);
