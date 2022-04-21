import React from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { animated } from "react-spring";
import styled from "styled-components";

import { NamedRangeSlider } from "./NumericFieldFilter";
import CategoricalFilter from "./CategoricalFilter";
import {
  CONFIDENCE_LABELS,
  FLOAT_FIELD,
  FRAME_SUPPORT_FIELD,
  REGRESSION,
  SUPPORT_LABELS,
} from "../../utils/labels";
import { useExpand } from "./hooks";
import { getPathExtension } from "./LabelFieldFilters.state";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import * as stringField from "./StringFieldFilter.state";
import { countsAtom } from "./atoms";
import { KEYPOINT, KEYPOINTS } from "@fiftyone/looker/src/constants";

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
  color?: string;
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
  const skeleton = useRecoilValue(selectors.skeleton(entry.path));
  const cPath = `${path}.confidence`;
  const lPath = `${path}.label`;
  const sPath = `${path}.support`;
  const vPath = `${path}.value`;
  const kPath = `${path}.points.label`;

  return (
    <animated.div style={{ ...props }}>
      <div ref={ref}>
        <div style={{ margin: 3 }}>
          {modal && <HiddenLabelFilter entry={entry} />}
          {entry.labelType !== REGRESSION && (
            <CategoricalFilter
              color={entry.color}
              name={"label"}
              valueName={"label"}
              selectedValuesAtom={stringField.selectedValuesAtom({
                modal,
                path: lPath,
              })}
              countsAtom={countsAtom({ modal, path: lPath, filtered: false })}
              excludeAtom={stringField.excludeAtom({ modal, path: lPath })}
              modal={modal}
              path={lPath}
            />
          )}
          {CONFIDENCE_LABELS.includes(entry.labelType) && (
            <NamedRangeSlider
              modal={modal}
              color={entry.color}
              name={"confidence"}
              path={cPath}
              defaultRange={[0, 1]}
              fieldType={FLOAT_FIELD}
            />
          )}
          {skeleton && [KEYPOINTS, KEYPOINT].includes(entry.labelType) && (
            <CategoricalFilter
              color={entry.color}
              name={"skeleton.label"}
              valueName={"label"}
              selectedValuesAtom={stringField.selectedValuesAtom({
                modal,
                path: kPath,
              })}
              countsAtom={countsAtom({ modal, path: kPath, filtered: false })}
              excludeAtom={stringField.excludeAtom({ modal, path: kPath })}
              disableSearch={true}
              modal={modal}
              path={kPath}
            />
          )}
          {entry.labelType === REGRESSION && (
            <NamedRangeSlider
              color={entry.color}
              name={"value"}
              path={vPath}
              modal={modal}
              fieldType={FLOAT_FIELD}
            />
          )}
          {SUPPORT_LABELS.includes(entry.labelType) && (
            <NamedRangeSlider
              modal={modal}
              color={entry.color}
              name={"support"}
              path={sPath}
              fieldType={FRAME_SUPPORT_FIELD}
            />
          )}
        </div>
      </div>
    </animated.div>
  );
};

export default React.memo(LabelFilter);
