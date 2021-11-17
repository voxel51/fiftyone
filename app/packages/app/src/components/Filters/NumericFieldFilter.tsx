import React from "react";
import { animated } from "@react-spring/web";
import {
  SetterOrUpdater,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";

import * as selectors from "../../recoil/selectors";
import * as filterAtoms from "../../recoil/filters";

import * as numericAtoms from "./NumericFieldFilter.state";
import ExcludeOption from "./Exclude";
import RangeSlider from "./RangeSlider";
import Checkbox from "../Common/Checkbox";
import { Button } from "../utils";

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

const useOthers = ({
  fieldType,
  otherCounts,
  ...rest
}: {
  fieldType: string;
  defaultRange?: [number, number];
  modal: boolean;
  path: string;
  otherCounts: filterAtoms.OtherCounts;
}): [Other, [boolean, SetterOrUpdater<boolean>]][] => {
  const [none, setNone] = useRecoilState(
    filterAtoms.otherAtom({ ...rest, key: "none" })
  );

  const others: [Other, [boolean, SetterOrUpdater<boolean>]][] =
    fieldType !== FLOAT_FIELD
      ? [["none", [none, setNone]]]
      : [
          [
            "inf",
            useRecoilState(filterAtoms.otherAtom({ ...rest, key: "inf" })),
          ],
          [
            "ninf",
            useRecoilState(filterAtoms.otherAtom({ ...rest, key: "ninf" })),
          ],
          [
            "nan",
            useRecoilState(filterAtoms.otherAtom({ ...rest, key: "nan" })),
          ],
          ["none", [none, setNone]],
        ];

  return others.filter(([k]) => otherCounts[k] > 0);
};

export const NamedRangeSlider = React.memo(
  React.forwardRef(({ color, name, fieldType, ...rest }: NamedProps, ref) => {
    const setFilter = useSetRecoilState(
      filterAtoms.filter({ modal: rest.modal, path: rest.path })
    );
    const bounds = useRecoilValue(numericAtoms.boundsAtom(rest));
    const hasDefaultRange = useRecoilValue(numericAtoms.isDefaultRange(rest));
    const hasBounds = bounds.every((b) => b !== null);
    const nonfiniteCounts = useRecoilValue(
      filterAtoms.nonfiniteCounts({ modal: rest.modal, path: rest.path })
    );
    const others = useOthers({ ...rest, fieldType, otherCounts });
    const isFiltered = useRecoilValue(filterAtoms.fieldIsFiltered(rest));

    if (!hasBounds && others.length === 1 && others[0][0] === "none") {
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
          {(hasDefaultRange ||
            others.some(([_, [v]]) => v !== others[0][1][0])) &&
            others.map(([key, [value, setValue]]) => (
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
          {isFiltered && others.length > 0 && hasBounds && (
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
  modal,
  path,
}: {
  path: string;
  modal: boolean;
}) => {
  const color = useRecoilValue(selectors.colorMap(modal))(path);

  return (
    <NamedRangeSlider
      color={color}
      modal={modal}
      path={path}
      fieldType={fieldType}
    />
  );
};

export default React.memo(NumericFieldFilter);
