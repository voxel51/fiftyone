import React from "react";
import { animated } from "react-spring";
import {
  SetterOrUpdater,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";

import { countsAtom, filterStage } from "./atoms";

import { useExpand } from "./hooks";
import * as filterAtoms from "./NumericFieldFilter.state";
import CategoricalFilter from "./CategoricalFilter";
import ExcludeOption from "./Exclude";
import RangeSlider from "./RangeSlider";
import { Entry } from "../CheckboxGroup";
import Checkbox from "../Common/Checkbox";
import { Button } from "../FieldsSidebar";
import { FLOAT_FIELD } from "../../utils/labels";

const NamedRangeSliderContainer = styled.div`
  padding-bottom: 0.5rem;
  margin: 3px;
  font-weight: bold;
`;

const NamedRangeSliderHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

const RangeSliderContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem 0 0.5rem;
`;

export type Other = "nan" | "ninf" | "inf" | "none";

const OTHER_NAMES = {
  nan: "nan",
  ninf: "-inf",
  inf: "inf",
  none: null,
};

type NamedProps = {
  color: string;
  defaultRange?: [number, number];
  modal: boolean;
  name?: string;
  path: string;
  fieldType: string;
};

const useFieldType = () => {};

const useOthers = ({
  fieldType,
  ...rest
}: {
  fieldType: string;
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
}): [Other, [boolean, SetterOrUpdater<boolean>]][] => {
  const [none, setNone] = useRecoilState(
    filterAtoms.otherAtom({ ...rest, key: "none" })
  );
  if (fieldType !== FLOAT_FIELD) {
    return [["none", [none, setNone]]];
  }

  return [
    ["inf", useRecoilState(filterAtoms.otherAtom({ ...rest, key: "inf" }))],
    ["ninf", useRecoilState(filterAtoms.otherAtom({ ...rest, key: "ninf" }))],
    ["nan", useRecoilState(filterAtoms.otherAtom({ ...rest, key: "nan" }))],
    ["none", [none, setNone]],
  ];
};

export const NamedRangeSlider = React.memo(
  React.forwardRef(({ color, name, fieldType, ...rest }: NamedProps, ref) => {
    const setFilter = useSetRecoilState(
      filterStage({ modal: rest.modal, path: rest.path })
    );
    const bounds = useRecoilValue(filterAtoms.boundsAtom(rest));
    const hasDefaultRange = useRecoilValue(filterAtoms.isDefaultRange(rest));
    const hasBounds = bounds.every((b) => b !== null);
    const otherCounts = useRecoilValue(
      filterAtoms.otherCounts({ modal: rest.modal, path: rest.path })
    );
    const others = useOthers({ ...rest, fieldType });
    const isFiltered = useRecoilValue(filterAtoms.fieldIsFiltered(rest));

    if (!hasBounds) {
      return null;
    }

    return (
      <NamedRangeSliderContainer ref={ref}>
        {name && <NamedRangeSliderHeader>{name}</NamedRangeSliderHeader>}
        <RangeSliderContainer>
          {hasBounds && (
            <RangeSlider
              {...rest}
              showBounds={false}
              fieldType={fieldType}
              valueAtom={filterAtoms.rangeAtom(rest)}
              boundsAtom={filterAtoms.boundsAtom(rest)}
              color={color}
            />
          )}
          {hasDefaultRange &&
            others
              .filter(([k]) => otherCounts[k] > 0)
              .map(([key, [value, setValue]]) => (
                <Checkbox
                  color={color}
                  name={OTHER_NAMES[key]}
                  value={value}
                  setValue={setValue}
                  count={otherCounts[key]}
                  subCountAtom={filterAtoms.otherKeyedFilteredCount({
                    key,
                    modal: rest.modal,
                    path: rest.path,
                  })}
                  forceColor={true}
                />
              ))}
          {fieldType === FLOAT_FIELD && isFiltered && (
            <ExcludeOption
              excludeAtom={filterAtoms.excludeAtom(rest)}
              valueName={""}
              color={color}
            />
          )}
          {isFiltered && (
            <Button
              text={"Reset"}
              color={color}
              onClick={() => setFilter(null)}
              style={{
                margin: "0.25rem -0.5rem",
                height: "2rem",
                borderRadius: 0,
                textAlign: "center",
              }}
            ></Button>
          )}
        </RangeSliderContainer>
      </NamedRangeSliderContainer>
    );
  })
);

const NumericFieldFilter = ({
  expanded,
  entry,
  modal,
  fieldType,
}: {
  expanded: boolean;
  entry: Entry;
  modal: boolean;
  fieldType: string;
}) => {
  const [ref, props] = useExpand(expanded);

  return (
    <animated.div style={props}>
      {modal ? (
        <CategoricalFilter
          valueName={entry.path}
          color={entry.color}
          countsAtom={countsAtom({ modal, path: entry.path, filtered: false })}
          path={entry.path}
          modal={modal}
          disableItems={entry.disableList}
          ref={ref}
        />
      ) : (
        <NamedRangeSlider
          color={entry.color}
          modal={modal}
          path={entry.path}
          fieldType={fieldType}
          ref={ref}
        />
      )}
    </animated.div>
  );
};

export default React.memo(NumericFieldFilter);
