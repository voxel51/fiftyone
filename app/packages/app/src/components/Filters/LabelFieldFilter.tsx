import React from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { animated } from "react-spring";
import styled from "styled-components";

import { NamedRangeSlider } from "./RangeSlider";
import CategoricalFilter from "./CategoricalFilter";
import { CONFIDENCE_LABELS } from "../../utils/labels";
import { useExpand } from "./hooks";
import { getPathExtension } from "./LabelFieldFilters.state";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import * as numericField from "./NumericFieldFilter.state";
import * as stringField from "./StringFieldFilter.state";
import { countsAtom, noneCount } from "./utils";

const FilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
  margin: 3px;

  a {
    cursor: pointer;
    text-decoration: underline;
  }
`;

const HiddenLabelFilter = ({ entry }) => {
  const numHiddenLabels = useRecoilValue(
    selectors.hiddenFieldLabels(entry.name)
  ).length;
  const clear = useRecoilCallback(
    ({ snapshot, set }) => async () => {
      const hiddenInField = await snapshot.getPromise(
        selectors.hiddenFieldLabels(entry.name)
      );
      const hidden = await snapshot.getPromise(atoms.hiddenLabels);
      set(
        atoms.hiddenLabels,
        Object.fromEntries(
          Object.entries(hidden).filter(
            ([label_id]) => !hiddenInField.includes(label_id)
          )
        )
      );
    },
    [entry.name]
  );

  if (numHiddenLabels < 1) {
    return null;
  }
  return (
    <FilterHeader>
      Hidden: {numHiddenLabels}
      <a onClick={clear}>reset</a>
    </FilterHeader>
  );
};

interface Entry {
  path: string;
  name: string;
  color: string;
  labelType?: string;
}

type Props = {
  expanded: boolean;
  modal: boolean;
  entry: Entry;
};

const LabelFilter = ({ expanded, entry, modal }: Props) => {
  const [ref, props] = useExpand(expanded);
  const path = `${entry.path}${getPathExtension(entry.labelType)}`;
  const cPath = `${path}.confidence`;
  const lPath = `${path}.label`;

  const [selectedLabels, exclude] = modal
    ? [stringField.selectedValuesModalAtom, stringField.excludeModalAtom]
    : [stringField.selectedValuesAtom, stringField.excludeAtom];

  const [confidenceRange, noConfidence] = modal
    ? [numericField.rangeModalAtom, numericField.noneModalAtom]
    : [numericField.rangeAtom, numericField.noneAtom];

  modal && console.log("EHL");

  return (
    <animated.div style={{ ...props }}>
      <div ref={ref}>
        <div style={{ margin: 3 }}>
          {modal && <HiddenLabelFilter entry={entry} />}
          <CategoricalFilter
            color={entry.color}
            name={"Labels"}
            valueName={"label"}
            selectedValuesAtom={selectedLabels(lPath)}
            countsAtom={countsAtom({ modal, path: lPath })}
            excludeAtom={exclude(lPath)}
            modal={modal}
            path={lPath}
          />
          {CONFIDENCE_LABELS.includes(entry.labelType) && (
            <NamedRangeSlider
              color={entry.color}
              name={"Confidence"}
              noneAtom={noConfidence({ path: cPath, defaultRange: [0, 1] })}
              noneCountAtom={noneCount({ path: cPath, modal, filtered: false })}
              noneSubCountAtom={noneCount({
                path: cPath,
                modal,
                filtered: true,
              })}
              boundsAtom={numericField.boundsAtom({
                path: cPath,
                defaultRange: [0, 1],
              })}
              valueAtom={confidenceRange({ path: cPath, defaultRange: [0, 1] })}
            />
          )}
        </div>
      </div>
    </animated.div>
  );
};

export default React.memo(LabelFilter);
