import React, { useContext } from "react";
import { useRecoilState } from "recoil";
import { animated } from "react-spring";
import styled from "styled-components";

import { useExpand } from "./utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { SampleContext } from "../../utils/context";
import { NamedRangeSlider } from "./RangeSlider";
import { NamedStringFilter } from "./StringFilter";
import { CONFIDENCE_LABELS } from "../../utils/labels";
import { removeObjectIDsFromSelection } from "../../utils/selection";

const GLOBAL_ATOMS = {
  colorByLabel: atoms.colorByLabel,
  includeLabels: selectors.filterIncludeLabels,
  includeNoLabel: selectors.filterIncludeNoLabel,
  includeNoConfidence: selectors.filterLabelIncludeNoConfidence,
  confidenceRange: selectors.filterLabelConfidenceRange,
  confidenceBounds: selectors.labelConfidenceBounds,
  fieldIsFiltered: selectors.fieldIsFiltered,
};

const MODAL_ATOMS = {
  colorByLabel: atoms.modalColorByLabel,
  includeLabels: atoms.modalFilterIncludeLabels,
  includeNoLabel: selectors.modalFilterIncludeNoLabel,
  includeNoConfidence: atoms.modalFilterLabelIncludeNoConfidence,
  confidenceRange: atoms.modalFilterLabelConfidenceRange,
  confidenceBounds: selectors.labelConfidenceBounds,
  fieldIsFiltered: selectors.modalFieldIsFiltered,
};

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
  const atoms = modal ? MODAL_ATOMS : GLOBAL_ATOMS;

  return (
    <animated.div style={{ ...props }}>
      <div ref={ref}>
        <div style={{ margin: 3 }}>
          <NamedStringFilter
            color={entry.color}
            name={"Labels"}
            valueName={"label"}
            valuesAtom={selectors.labelClasses(entry.path)}
            selectedValuesAtom={atoms.includeLabels(entry.path)}
            noneAtom={atoms.includeNoLabel(entry.path)}
          />
          <HiddenObjectFilter entry={entry} />
          {CONFIDENCE_LABELS.includes(entry.type) && (
            <NamedRangeSlider
              color={entry.color}
              name={"Confidence"}
              valueName={"confidence"}
              noneAtom={atoms.includeNoConfidence(entry.path)}
              boundsAtom={atoms.confidenceBounds(entry.path)}
              rangeAtom={atoms.confidenceRange(entry.path)}
            />
          )}
        </div>
      </div>
    </animated.div>
  );
};

export default React.memo(LabelFilter);
